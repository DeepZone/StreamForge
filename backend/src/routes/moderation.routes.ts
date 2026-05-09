import { Platform, Role } from '@prisma/client';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { prisma } from '../db/prisma.js';
import { audit } from '../services/auditService.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { hasRequiredBroadcasterScopes } from '../twitch/scopes.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';

const twitchApi = new TwitchApi();
const allowedRole: Role = 'channel_moderator';

const baseSchema = z.object({ userId: z.string().min(1).max(100), username: z.string().min(1).max(100).optional(), reason: z.string().min(1).max(500).optional() }).strict();
const timeoutSchema = baseSchema.extend({ durationSeconds: z.number().int().min(1).max(1209600) }).strict();
const banSchema = baseSchema;
const unbanSchema = z.object({ userId: z.string().min(1).max(100), username: z.string().min(1).max(100).optional(), actionLabel: z.enum(['unban', 'untimeout']).optional() }).strict();
const bansQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), type: z.enum(['all', 'bans', 'timeouts']).default('all'), username: z.string().max(100).optional(), userId: z.string().max(100).optional() }).strict();

const moderationRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/channels/:channelId/moderation/timeout', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const body = timeoutSchema.safeParse(req.body);
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    return executeModeration(req as AuthedRequest, rep, 'timeout', body.data);
  });
  app.post('/api/channels/:channelId/moderation/ban', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const body = banSchema.safeParse(req.body);
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    return executeModeration(req as AuthedRequest, rep, 'ban', body.data as any);
  });
  app.post('/api/channels/:channelId/moderation/unban', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const body = unbanSchema.safeParse(req.body);
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    return executeModeration(req as AuthedRequest, rep, 'unban', body.data as any);
  });

  app.get('/api/channels/:channelId/moderation/bans', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const query = bansQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return rep.code(400).send({ errorCode: 'validation.failed', details: query.error.issues });
    const { channel, accessToken } = await loadChannelTwitchAuth(req as AuthedRequest, rep);
    if (!channel || !accessToken) return;

    let after: string | undefined;
    const items: any[] = [];
    try {
      do {
        const page = await twitchApi.getBannedUsers({ broadcasterId: channel.twitchChannelId, accessToken, first: Math.min(query.data.limit, 100), after, userId: query.data.userId });
        for (const entry of page.data) {
          const username = entry.user_name || entry.user_login || '';
          if (query.data.username && !username.toLowerCase().includes(query.data.username.toLowerCase())) continue;
          const expiresAt = entry.expires_at || null;
          const isTimeout = !!expiresAt && Number.isFinite(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() > Date.now();
          const type = isTimeout ? 'timeout' : 'ban';
          if ((query.data.type === 'bans' && type !== 'ban') || (query.data.type === 'timeouts' && type !== 'timeout')) continue;
          items.push({ userId: entry.user_id, userLogin: entry.user_login, userName: entry.user_name, type, reason: entry.reason || '', createdAt: entry.created_at || null, expiresAt, moderatorName: entry.moderator_name || entry.moderator_login || null });
          if (items.length >= query.data.limit) break;
        }
        after = page.pagination?.cursor;
      } while (after && items.length < query.data.limit);
    } catch (e) {
      if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.moderation.fetch_bans_failed', status: e.status, message: e.safeMessage });
      return rep.code(502).send({ errorCode: 'twitch.moderation.fetch_bans_failed' });
    }
    return { items, total: items.length, updatedAt: new Date().toISOString() };
  });

  app.get('/api/channels/:channelId/moderation/actions', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const { channelId } = req.params as { channelId: string };
    const q = req.query as any;
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const where: any = { channelId };
    if (q.actionType) where.actionType = String(q.actionType);
    if (q.username) where.targetUsername = { contains: String(q.username), mode: 'insensitive' };
    const actions = await prisma.moderationAction.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } });
    return { actions };
  });
};

async function loadChannelTwitchAuth(req: AuthedRequest, rep: any) {
  const { channelId } = req.params as { channelId: string };
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) { rep.code(404).send({ errorCode: 'channel.not_found' }); return {}; }
  const token = await prisma.twitchToken.findUnique({ where: { channelId } });
  if (!token) { rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' }); return {}; }
  let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
  try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' }); return {}; }
  if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
    try { const refreshed = await twitchApi.refreshAccessToken(refreshToken); accessToken = refreshed.access_token; scopes = refreshed.scope ?? scopes; await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } }); }
    catch { rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' }); return {}; }
  }
  if (!hasRequiredBroadcasterScopes(scopes) || !scopes.includes('moderator:manage:banned_users')) { rep.code(400).send({ errorCode: 'twitch.moderation.scope_missing', hint: 'Twitch erneut verbinden, damit moderator:manage:banned_users verfügbar ist.' }); return {}; }
  return { channel, accessToken };
}

async function executeModeration(req: AuthedRequest, rep: any, actionType: 'timeout'|'ban'|'unban', payload: any) {
  const { channel, accessToken } = await loadChannelTwitchAuth(req, rep);
  if (!channel || !accessToken) return;
  if (payload.userId === channel.twitchChannelId) return rep.code(409).send({ errorCode: 'twitch.moderation.cannot_modify_broadcaster' });

  let actualAction: 'timeout' | 'ban' | 'unban' | 'untimeout' = actionType as any;
  if (actionType === 'unban') {
    if (payload.actionLabel) actualAction = payload.actionLabel;
    else {
      try {
        const check = await twitchApi.getBannedUsers({ broadcasterId: channel.twitchChannelId, accessToken, userId: payload.userId, first: 1 });
        const expiresAt = check.data[0]?.expires_at;
        actualAction = expiresAt && new Date(expiresAt).getTime() > Date.now() ? 'untimeout' : 'unban';
      } catch { actualAction = 'unban'; }
    }
  }

  try {
    if (actionType === 'timeout') await twitchApi.timeoutUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, durationSeconds: payload.durationSeconds, reason: payload.reason, accessToken });
    else if (actionType === 'ban') await twitchApi.banUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, reason: payload.reason, accessToken });
    else await twitchApi.unbanUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, accessToken });
  } catch (e: any) {
    if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed', status: e.status, message: e.safeMessage });
    return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed' });
  }

  const { channelId } = req.params as { channelId: string };
  const community = await prisma.communityUser.findFirst({ where: { channelId, platform: Platform.twitch, externalUserId: payload.userId } });
  await prisma.moderationAction.create({ data: { channelId, communityUserId: community?.id, targetExternalUserId: payload.userId, targetUsername: payload.username, actionType: actualAction, durationSeconds: payload.durationSeconds, reason: payload.reason, createdByUserId: req.session.id } });
  await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: actualAction === 'untimeout' ? 'moderation_untimeout' : actualAction === 'unban' ? 'moderation_unban' : 'moderation_action', payloadJson: JSON.stringify({ actionType: actualAction, userId: payload.userId, username: payload.username || null, durationSeconds: payload.durationSeconds || null }) } });
  await audit('moderation.action', req.session.id, channelId, { actionType: actualAction, userId: payload.userId, username: payload.username || null });
  return { ok: true, userId: payload.userId, username: payload.username || null, action: actualAction };
}

export default moderationRoutes;
