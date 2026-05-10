import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { isAdmin, requireAuth, AuthedRequest } from '../auth/guards.js';
import { env, getMissingTwitchOAuthEnvVars, isTokenEncryptionKeyValid } from '../config/env.js';
import { TWITCH_BOT_ACCOUNT_SCOPES, TWITCH_BROADCASTER_SCOPES } from '../twitch/scopes.js';
import { twitchConnectionManager } from '../twitch/managerSingleton.js';
import { audit } from '../services/auditService.js';
import { getTimerWorkerHealth } from '../workers/timerWorker.js';
import { prisma } from '../db/prisma.js';

import crypto from 'crypto';
import { setTwitchBotOAuthState } from '../auth/session.js';


const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/admin/health', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const twitchHealth = twitchConnectionManager.health();
    const channelIds = twitchHealth.sessions.map((s: any) => s.channelId);
    const channels = channelIds.length ? await prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, displayName: true, twitchLogin: true, twitchChannelId: true } }) : [];
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const sessions = twitchHealth.sessions.map((s: any) => ({ ...s, ...channelMap.get(s.channelId) }));
    return { ok: true, db: 'up', backend: 'up', twitch: { ...twitchHealth, sessions }, timerWorker: getTimerWorkerHealth() };
  });



  app.get('/api/admin/overview', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const [usersTotal, channelsTotal, activeChannels, bot, health] = await Promise.all([
      prisma.user.count(),
      prisma.channel.count(),
      prisma.channel.count({ where: { isActive: true } }),
      prisma.platformTwitchBot.findFirst({ orderBy: { updatedAt: 'desc' } }),
      Promise.resolve(twitchConnectionManager.health())
    ]);
    const channelsWithErrors = health.sessions.filter((x: any) => x?.lastError).length;
    return { usersTotal, channelsTotal, activeChannels, eventSubSessions: health.sessions.length, channelsWithErrors, platformBotConnected: Boolean(bot?.isActive) };
  });

  app.get('/api/admin/users', { preHandler: requireAuth }, async (req, rep) => {
    const role = (req as AuthedRequest).session.role as Role;
    if (role !== 'system_owner') return rep.code(403).send({ error: 'forbidden' });
    const users = await prisma.user.findMany({ include: { members: true }, orderBy: { createdAt: 'desc' } });
    return users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: (u.members.find((m) => m.role === 'system_owner')?.role ?? u.members.find((m) => m.role === 'platform_admin')?.role ?? 'viewer'), createdAt: u.createdAt, updatedAt: u.updatedAt, channelRolesCount: u.members.length, lastLoginAt: null }));
  });

  app.post('/api/admin/users', { preHandler: requireAuth }, async (req: any, rep) => {
    const role = (req as AuthedRequest).session.role as Role;
    if (role !== 'system_owner') return rep.code(403).send({ error: 'forbidden' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const password = String(req.body?.password || '');
    const newRole = String(req.body?.role || 'viewer') as Role;
    if (!/^\S+@\S+\.\S+$/u.test(email)) return rep.code(400).send({ error: 'invalid_email' });
    if (displayName.length < 2 || displayName.length > 64) return rep.code(400).send({ error: 'invalid_display_name' });
    if (password.length < 12) return rep.code(400).send({ error: 'invalid_password' });
    if (!['platform_admin','system_owner','viewer'].includes(newRole)) return rep.code(400).send({ error: 'invalid_role' });
    const { hashPassword } = await import('../auth/password.js');
    const created = await prisma.user.create({ data: { email, displayName, passwordHash: await hashPassword(password) } });
    if (newRole !== 'viewer') await prisma.channelMember.create({ data: { userId: created.id, channelId: (await prisma.channel.findFirst({ select: { id: true } }))?.id || (await prisma.channel.create({ data: { twitchChannelId: `system-${created.id}`, twitchLogin: `system-${created.id}`, displayName: 'System Root' } })).id, role: newRole } });
    return { id: created.id, email: created.email, displayName: created.displayName, role: newRole };
  });

  app.get('/api/admin/streamers', { preHandler: requireAuth }, async (req, rep) => {
    const role = (req as AuthedRequest).session.role as Role;
    if (!isAdmin(role)) return rep.code(403).send({ error: 'forbidden' });
    const channels = await prisma.channel.findMany({ include: { members: { include: { user: true } }, tokens: true, botStatusLinks: true }, orderBy: { createdAt: 'desc' } });
    const health = twitchConnectionManager.health();
    const sessionByChannel = new Map((health.sessions || []).map((s: any) => [s.channelId, s]));
    return channels.map((c) => ({ channelId: c.id, displayName: c.displayName, twitchLogin: c.twitchLogin, twitchChannelId: c.twitchChannelId, avatarUrl: c.avatarUrl, isActive: c.isActive, botEnabled: c.botEnabled, createdAt: c.createdAt, updatedAt: c.updatedAt, owner: c.members.find((m) => m.role === 'channel_owner') ? { userId: c.members.find((m) => m.role === 'channel_owner')!.userId, displayName: c.members.find((m) => m.role === 'channel_owner')!.user.displayName, email: c.members.find((m) => m.role === 'channel_owner')!.user.email } : null, roles: c.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName, email: m.user.email, role: m.role })), twitchToken: c.tokens ? { present: true, expiresAt: c.tokens.expiresAt, scopes: JSON.parse(c.tokens.scopesJson || '[]') } : { present: false, expiresAt: null, scopes: [] }, eventSub: { status: sessionByChannel.get(c.id)?.status || 'unknown', subscribed: Boolean(sessionByChannel.get(c.id)), lastMessageAt: sessionByChannel.get(c.id)?.lastEventAt || null, lastError: sessionByChannel.get(c.id)?.lastError || null }, platformBot: { moderatorStatus: c.botStatusLinks[0]?.status || 'unknown', canSend: c.botStatusLinks[0]?.isModerator || false } }));
  });

  const ensureEnabled = (rep: any) => {
    if (!env.twitchEventSubEnabled) {
      rep.code(409).send({ error: 'eventsub_disabled' });
      return false;
    }
    return true;
  };


  app.get('/api/admin/twitch/config', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const missingEnvVars = [...getMissingTwitchOAuthEnvVars(), ...(!env.tokenKey ? ['TOKEN_ENCRYPTION_KEY'] : [])];
    return {
      oauthConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      redirectUri: env.twitchRedirectUri,
      publicApiUrl: env.publicApiUrl,
      publicAppUrl: env.publicAppUrl,
      eventSubEnabled: env.twitchEventSubEnabled,
      hasClientId: Boolean(env.twitchClientId),
      hasClientSecret: Boolean(env.twitchClientSecret),
      hasTokenEncryptionKey: Boolean(env.tokenKey),
      tokenEncryptionKeyValid: isTokenEncryptionKeyValid(),
      effectiveFrontendUrl: env.frontendUrl,
      effectiveBackendUrl: env.backendUrl,
      cookieSecure: env.nodeEnv === 'production' || env.cookieSecure,
      cookieSameSite: env.cookieSameSite,
      nodeEnv: env.nodeEnv,
      trustProxy: env.trustProxy,
      scopes: { broadcaster: [...TWITCH_BROADCASTER_SCOPES], botAccount: [...TWITCH_BOT_ACCOUNT_SCOPES] },
      platformBotOAuth: {
        startPath: '/api/admin/twitch/platform-bot/start',
        callbackPath: '/api/auth/twitch/platform-bot/callback',
        redirectUri: `${env.publicApiUrl}/auth/twitch/platform-bot/callback`
      }
    };
  });

  
  app.get('/api/admin/twitch/platform-bot', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const bot = await prisma.platformTwitchBot.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!bot) return { connected: false, botLogin: null, botDisplayName: null, avatarUrl: null, tokenExpiresAt: null, scopes: [], isActive: false };
    return { connected: true, botLogin: bot.twitchLogin, botDisplayName: bot.displayName, avatarUrl: bot.avatarUrl, tokenExpiresAt: bot.expiresAt, scopes: JSON.parse(bot.scopesJson || '[]'), isActive: bot.isActive };
  });
app.get('/api/admin/twitch/platform-bot/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const state = crypto.randomBytes(32).toString('hex');
    setTwitchBotOAuthState(rep, state);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.twitchClientId);
    url.searchParams.set('redirect_uri', `${env.publicApiUrl}/auth/twitch/platform-bot/callback`);
    url.searchParams.set('scope', TWITCH_BOT_ACCOUNT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return rep.code(302).redirect(url.toString());
  });


  app.post('/api/admin/twitch/eventsub/restart', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const result = await twitchConnectionManager.restartEventSub();
    await audit('admin_twitch_restart_eventsub', authed.session.id);
    return result;
  });
  app.post('/api/admin/twitch/subscriptions/cleanup', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const body = (req.body ?? {}) as { channelId?: string };
    const result = await twitchConnectionManager.cleanupSubscriptions(body.channelId);
    await audit('admin_twitch_cleanup_subscriptions', authed.session.id, body.channelId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/start-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const result = await twitchConnectionManager.startAll();
    await audit('admin_twitch_start_all', authed.session.id);
    return result;
  });
  app.post('/api/admin/twitch/sessions/stop-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const result = await twitchConnectionManager.stopAll();
    await audit('admin_twitch_stop_all', authed.session.id);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.startChannel(channelId);
      await audit('admin_twitch_start_channel', authed.session.id, channelId);
      return result;
    } catch (e: any) {
      return rep.code(400).send({ error: e?.message ?? 'start_failed' });
    }
  });
  app.post('/api/admin/twitch/sessions/:channelId/stop', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const channelId = (req.params as { channelId: string }).channelId;
    const result = await twitchConnectionManager.stopChannel(channelId);
    await audit('admin_twitch_stop_channel', authed.session.id, channelId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/restart', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.restartChannel(channelId);
      await audit('admin_twitch_restart_channel', authed.session.id, channelId);
      return result;
    } catch (e: any) {
      return rep.code(400).send({ error: e?.message ?? 'restart_failed' });
    }
  });
};
export default adminRoutes;
