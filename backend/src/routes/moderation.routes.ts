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

const baseSchema = z.object({
  userId: z.string().min(1).max(100),
  username: z.string().min(1).max(100).optional(),
  reason: z.string().min(1).max(500).optional()
}).strict();

const timeoutSchema = baseSchema.extend({ durationSeconds: z.number().int().min(1).max(1209600) }).strict();
const banSchema = baseSchema;
const unbanSchema = z.object({ userId: z.string().min(1).max(100), username: z.string().min(1).max(100).optional() }).strict();

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

  app.get('/api/channels/:channelId/moderation/actions', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, allowedRole);
    const { channelId } = req.params as { channelId: string };
    const q = req.query as any;
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const where: any = { channelId };
    if (q.actionType) where.actionType = String(q.actionType);
    if (q.username) where.targetUsername = { contains: String(q.username), mode: 'insensitive' };
    const createdAt: any = {};
    if (q.from) createdAt.gte = new Date(q.from);
    if (q.to) createdAt.lte = new Date(q.to);
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
    const actions = await prisma.moderationAction.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } });
    return { actions };
  });
};

async function executeModeration(req: AuthedRequest, rep: any, actionType: 'timeout'|'ban'|'unban', payload: any) {
  const { channelId } = req.params as { channelId: string };
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
  const token = await prisma.twitchToken.findUnique({ where: { channelId } });
  if (!token) return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' });
  let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
  try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' }); }
  if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
    try {
      const refreshed = await twitchApi.refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      scopes = refreshed.scope ?? scopes;
      await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } });
    } catch { return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required', hint: 'Twitch erneut verbinden.' }); }
  }
  if (!hasRequiredBroadcasterScopes(scopes) || !scopes.includes('moderator:manage:banned_users')) return rep.code(400).send({ errorCode: 'twitch.moderation.scope_missing', hint: 'Twitch erneut verbinden, damit moderator:manage:banned_users verfügbar ist.' });
  try {
    if (actionType === 'timeout') await twitchApi.timeoutUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, durationSeconds: payload.durationSeconds, reason: payload.reason, accessToken });
    else if (actionType === 'ban') await twitchApi.banUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, reason: payload.reason, accessToken });
    else await twitchApi.unbanUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId: payload.userId, accessToken });
  } catch (e: any) {
    if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed', status: e.status, message: e.safeMessage });
    return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed' });
  }
  const community = await prisma.communityUser.findFirst({ where: { channelId, platform: Platform.twitch, externalUserId: payload.userId } });
  const storedType = actionType === 'unban' ? 'unban' : actionType;
  const action = await prisma.moderationAction.create({ data: { channelId, communityUserId: community?.id, targetExternalUserId: payload.userId, targetUsername: payload.username, actionType: storedType, durationSeconds: payload.durationSeconds, reason: payload.reason, createdByUserId: req.session.id } });
  await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'moderation_action', payloadJson: JSON.stringify({ actionType: storedType, userId: payload.userId, username: payload.username || null, durationSeconds: payload.durationSeconds || null }) } });
  await audit('moderation.action', req.session.id, channelId, { actionType: storedType, userId: payload.userId, username: payload.username || null });
  return { ok: true, action: { id: action.id, actionType: action.actionType, targetExternalUserId: action.targetExternalUserId, targetUsername: action.targetUsername, durationSeconds: action.durationSeconds, reason: action.reason, createdAt: action.createdAt } };
}

export default moderationRoutes;
