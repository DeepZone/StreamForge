import { FastifyPluginAsync } from 'fastify';
import { Platform, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, isAdmin, requireAuth, requireChannelRole } from '../auth/guards.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { eventBus } from '../core/EventBus.js';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { setTwitchBotOAuthState } from '../auth/session.js';
import { TWITCH_BOT_ACCOUNT_SCOPES } from '../twitch/scopes.js';

const twitchApi = new TwitchApi();

const channelsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels', { preHandler: requireAuth }, async (req) => {
    const authed = req as AuthedRequest;
    const channels = await prisma.channel.findMany({
      where: isAdmin(authed.session.role as Role) ? {} : { id: { in: Object.keys(authed.session.channelRoles) } }
    });
    return channels.map((channel) => ({ ...channel, role: authed.session.channelRoles[channel.id] || authed.session.role }));
  });

  app.post('/api/channels', { preHandler: requireAuth }, async (req: any, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    return prisma.channel.create({ data: { twitchChannelId: req.body.twitchChannelId, twitchLogin: req.body.twitchLogin, displayName: req.body.displayName, avatarUrl: req.body.avatarUrl } });
  });

  app.get('/api/channels/:channelId', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    return prisma.channel.findUnique({ where: { id: (req.params as { channelId: string }).channelId } });
  });


  app.get('/api/channels/:channelId/logs', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    await requireChannelRole(authed, rep);
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string; eventType?: string; platform?: string };
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const where: any = { channelId };
    if (q.eventType) where.eventType = q.eventType;
    if (q.platform && Object.values(Platform).includes(q.platform as Platform)) where.platform = q.platform as Platform;
    const logs = await prisma.botEvent.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } });
    return { items: logs };
  });

  app.get('/api/channels/:channelId/chat/messages', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string; before?: string };
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const beforeDate = q.before ? new Date(q.before) : undefined;
    const items = await prisma.chatMessage.findMany({
      where: { channelId, ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return { items };
  });

  app.get('/api/channels/:channelId/live/chat/stream', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    rep.raw.setHeader('Content-Type', 'text/event-stream');
    rep.raw.setHeader('Cache-Control', 'no-cache');
    rep.raw.setHeader('Connection', 'keep-alive');
    rep.hijack();
    const send = (event: any) => { rep.raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    const handler = (event: any) => send(event);
    eventBus.subscribe(channelId, handler);
    const keepalive = setInterval(() => send({ type: 'system.keepalive', channelId, createdAt: new Date().toISOString() }), 25000);
    req.raw.on('close', () => { clearInterval(keepalive); eventBus.unsubscribe(channelId, handler); rep.raw.end(); });
  });

  app.get('/api/channels/:channelId/twitch/chatters', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string };
    const first = Math.min(Math.max(Number(q.limit || 100), 1), 1000);
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.chatters.token_error' });
    let accessToken = '';
    let refreshToken = '';
    let scopes: string[] = [];
    try {
      accessToken = decryptSecret(token.accessTokenEncrypted);
      refreshToken = decryptSecret(token.refreshTokenEncrypted);
      scopes = JSON.parse(token.scopesJson || '[]');
    } catch { return rep.code(400).send({ errorCode: 'twitch.chatters.token_error' }); }
    if (!scopes.includes('moderator:read:chatters')) return rep.code(400).send({ errorCode: 'twitch.chatters.missing_scope', detail: 'Bitte Twitch neu verbinden.' });
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await twitchApi.refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        scopes = refreshed.scope ?? scopes;
        await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } });
      } catch { return rep.code(400).send({ errorCode: 'twitch.chatters.token_error' }); }
    }
    try {
      const result = await twitchApi.getChatters({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, accessToken, first });
      const ids = result.data.map((d) => d.user_id);
      const community = ids.length ? await prisma.communityUser.findMany({ where: { channelId, platform: Platform.twitch, externalUserId: { in: ids } } }) : [];
      const cMap = new Map(community.map((c) => [c.externalUserId, c]));
      return { total: result.total ?? result.data.length, updatedAt: new Date().toISOString(), note: 'Twitch aktualisiert die Chatters-Liste verzögert.', items: result.data.map((x) => ({ userId: x.user_id, userLogin: x.user_login, userName: x.user_name, firstSeenAt: cMap.get(x.user_id)?.firstSeenAt ?? null, lastSeenAt: cMap.get(x.user_id)?.lastSeenAt ?? null, messageCount: cMap.get(x.user_id)?.messageCount ?? 0, commandCount: cMap.get(x.user_id)?.commandCount ?? 0 })) };
    } catch (e: any) {
      if (e instanceof TwitchApiError && e.status === 403) return rep.code(400).send({ errorCode: 'twitch.chatters.missing_scope', detail: 'Bitte Twitch neu verbinden.' });
      return rep.code(502).send({ errorCode: 'twitch.chatters.fetch_failed' });
    }
  });

  app.get('/api/channels/:channelId/twitch/bot/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    await requireChannelRole(authed, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const state = crypto.randomBytes(32).toString('hex');
    setTwitchBotOAuthState(rep, state);
    rep.setCookie('sf_twitch_bot_oauth_meta', JSON.stringify({ channelId }), { path: '/api/auth/twitch/bot', signed: true, httpOnly: true, sameSite: 'lax', secure: env.nodeEnv === 'production', maxAge: 60 * 10 });
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.twitchClientId);
    url.searchParams.set('redirect_uri', `${env.publicApiUrl}/api/auth/twitch/bot/callback`);
    url.searchParams.set('scope', TWITCH_BOT_ACCOUNT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return rep.code(302).redirect(url.toString());
  });

  app.get('/api/channels/:channelId/twitch/bot', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const link = await prisma.channelBotAccount.findUnique({ where: { channelId }, include: { botAccount: true } });
    if (!link) return { connected: false, sendAs: 'broadcaster' };
    return { connected: true, enabled: link.enabled, sendAs: link.enabled ? 'bot_account' : 'broadcaster', botLogin: link.botAccount.twitchLogin, botDisplayName: link.botAccount.displayName, expiresAt: link.botAccount.expiresAt, scopes: JSON.parse(link.botAccount.scopesJson || '[]') };
  });

  app.delete('/api/channels/:channelId/twitch/bot', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    await prisma.channelBotAccount.deleteMany({ where: { channelId } });
    return { ok: true };
  });
};
export default channelsRoutes;
