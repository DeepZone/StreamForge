import { FastifyPluginAsync } from 'fastify';
import { Platform, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, isAdmin, requireAuth, requireChannelRole } from '../auth/guards.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { eventBus } from '../core/EventBus.js';
import { z } from 'zod';

const twitchApi = new TwitchApi();

const twitchChannelRoles: Role[] = ['viewer', 'channel_moderator', 'channel_admin', 'channel_owner'];

const roleActionSchema = z.object({
  action: z.enum(['make_moderator', 'remove_moderator', 'make_vip', 'remove_vip']),
  username: z.string().max(100).optional()
}).strict();
const requiredRoleScopes = ['channel:manage:moderators', 'channel:read:vips', 'channel:manage:vips'] as const;
const moderationScope = 'moderator:manage:banned_users';
const platformBotModeratorScope = 'channel:manage:moderators';
const BOT_STATUS_STALE_MS = 10 * 60 * 1000;
const moderationActionSchema = z.object({ action: z.enum(['timeout','ban','unban']), username: z.string().max(100).optional(), durationSeconds: z.number().int().min(1).max(1209600).optional(), reason: z.string().max(500).optional() }).strict();
const liveChatSendSchema = z.object({
  message: z.string().max(500),
  replyParentMessageId: z.string().max(128).optional()
}).strict();

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
  app.post('/api/channels/:channelId/live/chat/send', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const body = liveChatSendSchema.safeParse(req.body ?? {});
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    const { channelId } = req.params as { channelId: string };
    const message = body.data.message.trim();
    if (!message) return rep.code(400).send({ errorCode: 'validation.failed', details: [{ message: 'message required' }] });

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.live_chat.auth_required' });

    let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
    try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.live_chat.auth_required' }); }
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await twitchApi.refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        scopes = refreshed.scope ?? scopes;
        await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } });
      } catch {
        return rep.code(400).send({ errorCode: 'twitch.live_chat.auth_required' });
      }
    }

    if (!scopes.includes('user:write:chat')) return rep.code(400).send({ errorCode: 'twitch.live_chat.scope_missing', hint: 'Bitte Twitch erneut verbinden, damit StreamForge als Streamer schreiben darf.' });

    try {
      const response = await twitchApi.sendChatMessage({ broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken, message, replyParentMessageId: body.data.replyParentMessageId });
      const result = response?.data?.[0] ?? {};
      const isSent = result?.is_sent === true;
      if (!isSent) {
        await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_failed', payloadJson: JSON.stringify({ dropReason: result?.drop_reason ?? null }) } });
        await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_failed', detailsJson: JSON.stringify({ dropReason: result?.drop_reason ?? null }) } });
        return rep.code(400).send({ errorCode: 'twitch.live_chat.dropped', ok: false, isSent: false, dropReason: result?.drop_reason ?? { code: 'unknown', message: 'Message dropped by Twitch.' } });
      }
      await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_sent', payloadJson: JSON.stringify({ messageId: result?.message_id ?? null }) } });
      await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_sent', detailsJson: JSON.stringify({ messageId: result?.message_id ?? null }) } });
      return { ok: true, messageId: result?.message_id ?? null, isSent: true };
    } catch (e) {
      await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_failed', payloadJson: JSON.stringify({ reason: 'api_failed' }) } });
      await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_failed', detailsJson: JSON.stringify({ reason: 'api_failed' }) } });
      if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.live_chat.send_failed', status: e.status, message: e.safeMessage });
      return rep.code(502).send({ errorCode: 'twitch.live_chat.send_failed' });
    }
  });




  app.get('/api/channels/:channelId/twitch/chatters', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string };
    const first = Math.min(Math.max(Number(q.limit || 100), 1), 1000);
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' });
    let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
    try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' }); }
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      try { const refreshed = await twitchApi.refreshAccessToken(refreshToken); accessToken = refreshed.access_token; scopes = refreshed.scope ?? scopes; await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } }); } catch { return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' }); }
    }
    try {
      const result = await twitchApi.getChatters({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, accessToken, first });
      const ids = result.data.map((d) => d.user_id);
      const community = ids.length ? await prisma.communityUser.findMany({ where: { channelId, platform: Platform.twitch, externalUserId: { in: ids } } }) : [];
      const cMap = new Map(community.map((c) => [c.externalUserId, c]));
      const missingScopes = requiredRoleScopes.filter((x) => !scopes.includes(x));
      let modSet = new Set<string>(); let vipSet = new Set<string>();
      const roleStatusAvailable = missingScopes.length === 0;
      if (roleStatusAvailable) {
        try {
          let after: string | undefined;
          do { const mods = await twitchApi.getChannelModerators({ broadcasterId: channel.twitchChannelId, accessToken, first: 100, after }); mods.data.forEach((m) => modSet.add(m.user_id)); after = mods.pagination?.cursor; } while (after);
          after = undefined;
          do { const vips = await twitchApi.getChannelVips({ broadcasterId: channel.twitchChannelId, accessToken, first: 100, after }); vips.data.forEach((v) => vipSet.add(v.user_id)); after = vips.pagination?.cursor; } while (after);
        } catch {}
      }
      const items = result.data.map((x) => {
        const isBroadcaster = x.user_id === channel.twitchChannelId;
        const isMod = modSet.has(x.user_id);
        const isVip = vipSet.has(x.user_id);
        const role = !roleStatusAvailable ? 'unknown' : isBroadcaster ? 'broadcaster' : isMod ? 'moderator' : isVip ? 'vip' : 'viewer';
        const moderationStatus = { isBanned: false, isTimedOut: false, banExpiresAt: null as string | null, banReason: null as string | null };
        const moderationCapabilities = isBroadcaster ? { canTimeout: false, canBan: false, canUnban: false } : { canTimeout: true, canBan: true, canUnban: false };
        return { userId: x.user_id, userLogin: x.user_login, userName: x.user_name, role, roleCapabilities: { canMakeModerator: roleStatusAvailable && !isBroadcaster && !isMod, canRemoveModerator: roleStatusAvailable && !isBroadcaster && isMod, canMakeVip: roleStatusAvailable && !isBroadcaster && !isVip && !isMod, canRemoveVip: roleStatusAvailable && !isBroadcaster && isVip }, moderationStatus, moderationCapabilities, firstSeenAt: cMap.get(x.user_id)?.firstSeenAt ?? null, lastSeenAt: cMap.get(x.user_id)?.lastSeenAt ?? null, messageCount: cMap.get(x.user_id)?.messageCount ?? 0, commandCount: cMap.get(x.user_id)?.commandCount ?? 0 };
      });
      const moderationStatusAvailable = scopes.includes(moderationScope);
      return { total: result.total ?? result.data.length, updatedAt: new Date().toISOString(), note: 'Twitch aktualisiert die Chatters-Liste verzögert.', roleStatusAvailable, missingScopes, moderationStatusAvailable, items };
    } catch (e: any) {
      if (e instanceof TwitchApiError && e.status === 403) return rep.code(400).send({ errorCode: 'twitch.chatters.missing_scope', detail: 'Bitte Twitch neu verbinden.' });
      return rep.code(502).send({ errorCode: 'twitch.chatters.fetch_failed' });
    }
  });

  app.post('/api/channels/:channelId/twitch/chatters/:userId/role', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const body = roleActionSchema.safeParse(req.body);
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    const { channelId, userId } = req.params as { channelId: string; userId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    if (userId === channel.twitchChannelId) return rep.code(409).send({ errorCode: 'twitch.roles.cannot_modify_broadcaster' });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' });
    let accessToken=''; let refreshToken=''; let scopes:string[]=[];
    try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' }); }
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) { try { const refreshed = await twitchApi.refreshAccessToken(refreshToken); accessToken = refreshed.access_token; scopes = refreshed.scope ?? scopes; await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } }); } catch { return rep.code(400).send({ errorCode: 'twitch.roles.auth_required' }); } }
    const missing = requiredRoleScopes.filter((x) => !scopes.includes(x));
    if (missing.length) return rep.code(400).send({ errorCode: 'twitch.roles.scope_missing', missingScopes: missing });
    try {
      const isMod = (await twitchApi.getChannelModerators({ broadcasterId: channel.twitchChannelId, userId, accessToken, first: 1 })).data.length > 0;
      const isVip = (await twitchApi.getChannelVips({ broadcasterId: channel.twitchChannelId, userId, accessToken, first: 1 })).data.length > 0;
      const action = body.data.action;
      if (action === 'make_moderator' && isMod) return rep.code(409).send({ errorCode: 'twitch.roles.already_moderator' });
      if (action === 'remove_moderator' && !isMod) return rep.code(409).send({ errorCode: 'twitch.roles.not_moderator' });
      if (action === 'make_vip' && isVip) return rep.code(409).send({ errorCode: 'twitch.roles.already_vip' });
      if (action === 'remove_vip' && !isVip) return rep.code(409).send({ errorCode: 'twitch.roles.not_vip' });
      if (action === 'make_moderator') await twitchApi.addChannelModerator({ broadcasterId: channel.twitchChannelId, userId, accessToken });
      if (action === 'remove_moderator') await twitchApi.removeChannelModerator({ broadcasterId: channel.twitchChannelId, userId, accessToken });
      if (action === 'make_vip') await twitchApi.addChannelVip({ broadcasterId: channel.twitchChannelId, userId, accessToken });
      if (action === 'remove_vip') await twitchApi.removeChannelVip({ broadcasterId: channel.twitchChannelId, userId, accessToken });
      const roleType = action.includes('moderator') ? 'moderator' : 'vip';
      const actionType = action.startsWith('make') ? 'add' : 'remove';
      await prisma.twitchRoleAction.create({ data: { channelId, targetExternalUserId: userId, targetUsername: body.data.username, roleType, actionType, createdByUserId: req.session.userId } });
      await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: `twitch.role.${action}`, detailsJson: JSON.stringify({ targetExternalUserId: userId, targetUsername: body.data.username, roleType, actionType }) } });
      await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'twitch.role.changed', payloadJson: JSON.stringify({ action, targetExternalUserId: userId, targetUsername: body.data.username, roleType, actionType }) } });
      return { ok: true, action, userId, username: body.data.username ?? null, roleAfter: actionType === 'add' ? roleType : 'viewer' };
    } catch (e) {
      if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.roles.api_failed', status: e.status, safeMessage: e.safeMessage });
      return rep.code(502).send({ errorCode: 'twitch.roles.api_failed' });
    }
  });

  app.get('/api/channels/:channelId/twitch/role-actions', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string; roleType?: string; actionType?: string; username?: string };
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const items = await prisma.twitchRoleAction.findMany({ where: { channelId, ...(q.roleType ? { roleType: q.roleType } : {}), ...(q.actionType ? { actionType: q.actionType } : {}), ...(q.username ? { targetUsername: { contains: q.username, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: 'desc' }, take: limit });
    return { items };
  });



  app.post('/api/channels/:channelId/twitch/chatters/:userId/moderation', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const body = moderationActionSchema.safeParse(req.body);
    if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    if (body.data.action === 'timeout' && !body.data.durationSeconds) return rep.code(400).send({ errorCode: 'validation.failed', details: [{ message: 'durationSeconds required for timeout' }] });
    const { channelId, userId } = req.params as { channelId: string; userId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    if (userId === channel.twitchChannelId) return rep.code(409).send({ errorCode: 'twitch.moderation.cannot_modify_broadcaster' });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required' });
    let accessToken=''; let refreshToken=''; let scopes:string[]=[];
    try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required' }); }
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) { try { const refreshed = await twitchApi.refreshAccessToken(refreshToken); accessToken = refreshed.access_token; scopes = refreshed.scope ?? scopes; await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } }); } catch { return rep.code(400).send({ errorCode: 'twitch.moderation.auth_required' }); } }
    if (!scopes.includes(moderationScope)) return rep.code(400).send({ errorCode: 'twitch.moderation.scope_missing', hint: 'Bitte Twitch erneut verbinden, damit StreamForge diese Aktion ausführen darf.' });
    try {
      if (body.data.action === 'timeout') await twitchApi.timeoutUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId, durationSeconds: body.data.durationSeconds!, reason: body.data.reason, accessToken });
      if (body.data.action === 'ban') await twitchApi.banUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId, reason: body.data.reason, accessToken });
      if (body.data.action === 'unban') await twitchApi.unbanUser({ broadcasterId: channel.twitchChannelId, moderatorId: channel.twitchChannelId, userId, accessToken });
    } catch (e) {
      if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed', status: e.status, message: e.safeMessage });
      return rep.code(502).send({ errorCode: 'twitch.moderation.api_failed' });
    }
    const community = await prisma.communityUser.findFirst({ where: { channelId, platform: Platform.twitch, externalUserId: userId } });
    await prisma.moderationAction.create({ data: { channelId, communityUserId: community?.id, targetExternalUserId: userId, targetUsername: body.data.username, actionType: body.data.action, durationSeconds: body.data.durationSeconds, reason: body.data.reason, createdByUserId: req.session.userId } });
    await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: `twitch.moderation.${body.data.action}`, detailsJson: JSON.stringify({ userId, username: body.data.username || null, durationSeconds: body.data.durationSeconds || null }) } });
    await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'twitch.moderation.changed', payloadJson: JSON.stringify({ action: body.data.action, userId, username: body.data.username || null, durationSeconds: body.data.durationSeconds || null }) } });
    return { ok: true, action: body.data.action, userId, username: body.data.username || null, durationSeconds: body.data.durationSeconds ?? null };
  });


  
  app.get('/api/channels/:channelId/settings', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const settings = await prisma.channelSettings.upsert({ where: { channelId }, create: { channelId }, update: {} });
    return { channelId, displayName: channel.displayName, twitchLogin: channel.twitchLogin, twitchChannelId: channel.twitchChannelId, botEnabled: channel.botEnabled, isActive: channel.isActive, commandPrefix: settings.commandPrefix, language: settings.language, timezone: settings.timezone };
  });

  app.patch('/api/channels/:channelId/settings', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const bodySchema = z.object({ botEnabled: z.boolean().optional(), isActive: z.boolean().optional(), commandPrefix: z.string().min(1).max(5).optional(), language: z.enum(['de','en']).optional(), timezone: z.string().min(1).max(64).optional() }).strict();
    const parsed = bodySchema.safeParse(req.body || {});
    if (!parsed.success) return rep.code(400).send({ errorCode: 'validation.failed', details: parsed.error.issues });
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const data = parsed.data;
    await prisma.channel.update({ where: { id: channelId }, data: { ...(data.botEnabled !== undefined ? { botEnabled: data.botEnabled } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
    await prisma.channelSettings.upsert({ where: { channelId }, create: { channelId, ...(data.commandPrefix ? { commandPrefix: data.commandPrefix } : {}), ...(data.language ? { language: data.language } : {}), ...(data.timezone ? { timezone: data.timezone } : {}) }, update: { ...(data.commandPrefix ? { commandPrefix: data.commandPrefix } : {}), ...(data.language ? { language: data.language } : {}), ...(data.timezone ? { timezone: data.timezone } : {}) } });
    return { ok: true };
  });

  app.get('/api/channels/:channelId/twitch/bot', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const bot = await prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
    const status = await prisma.channelBotStatus.findUnique({ where: { channelId } });
    if (!bot) return { platformBotConnected: false, botLogin: null, botDisplayName: null, moderatorStatus: 'unknown', isModerator: false, canSendAsPlatformBot: false, instruction: null, canAutoAddModerator: false, missingScopes: [] };
    const lastCheckedAt = status?.lastCheckedAt?.toISOString() ?? null;
    const stale = !status?.lastCheckedAt || (Date.now() - status.lastCheckedAt.getTime()) > BOT_STATUS_STALE_MS;
    const mapped = stale ? 'unknown' : (status?.status === 'ready' ? 'verified_moderator' : status?.status === 'scope_missing' ? 'scope_missing' : status?.status === 'api_failed' ? 'api_failed' : status?.status === 'check_failed' ? 'check_failed' : 'not_moderator');
    const isModerator = mapped === 'verified_moderator';
    return { platformBotConnected: true, botLogin: bot.twitchLogin, botDisplayName: bot.displayName, moderatorStatus: mapped, isModerator, canSendAsPlatformBot: isModerator, lastCheckedAt, lastError: status?.lastError ?? null, instruction: `/mod ${bot.twitchLogin}`, canAutoAddModerator: true, missingScopes: [] };
  });

  app.post('/api/channels/:channelId/twitch/bot/check', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    const bot = await prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    const debug = {
      channelId,
      twitchChannelId: channel?.twitchChannelId ?? null,
      channelLogin: channel?.twitchLogin ?? null,
      botLogin: bot?.twitchLogin ?? null,
      botTwitchUserId: bot?.twitchUserId ?? null,
      hasChannelToken: Boolean(token),
      tokenScopes: [] as string[],
      requiredScopes: [platformBotModeratorScope]
    };
    const problem = (errorCode: string, status: number, detail: string, extra?: Record<string, unknown>) => rep.code(status).send({ errorCode, status, detail, requestId: req.id, ...extra });

    if (!channel) return problem('channel.not_found', 404, 'Channel wurde nicht gefunden.');
    if (!bot) return problem('twitch.platform_bot.not_configured', 400, 'Kein globaler Plattform-Bot ist konfiguriert.');
    if (!token) return problem('twitch.platform_bot.channel_token_missing', 400, 'Für diesen Channel fehlt ein Twitch-Broadcaster-Token.');

    let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
    try {
      accessToken = decryptSecret(token.accessTokenEncrypted);
      refreshToken = decryptSecret(token.refreshTokenEncrypted);
      scopes = JSON.parse(token.scopesJson || '[]');
      debug.tokenScopes = scopes;
    } catch {
      return problem('twitch.platform_bot.channel_token_missing', 400, 'Für diesen Channel fehlt ein gültiges Twitch-Broadcaster-Token.');
    }

    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await twitchApi.refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        scopes = refreshed.scope ?? scopes;
        debug.tokenScopes = scopes;
        await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } });
      } catch {
        return problem('twitch.platform_bot.channel_token_missing', 400, 'Für diesen Channel fehlt ein gültiges Twitch-Broadcaster-Token.');
      }
    }

    const missingScopes = [platformBotModeratorScope].filter((scope) => !scopes.includes(scope));
    if (missingScopes.length) {
      await prisma.channelBotStatus.upsert({ where: { channelId }, create: { channelId, platformBotId: bot.id, status: 'scope_missing', isModerator: false, lastCheckedAt: new Date(), lastError: 'scope_missing' }, update: { platformBotId: bot.id, status: 'scope_missing', isModerator: false, lastCheckedAt: new Date(), lastError: 'scope_missing' } });
      return problem('twitch.platform_bot.scope_missing', 400, 'Dem Twitch-Token fehlt die Berechtigung, Moderatorstatus zu prüfen.', { missingScopes, hint: 'Bitte Twitch-Kanal erneut verbinden.' });
    }

    try {
      const mods = await twitchApi.getChannelModerators({ broadcasterId: channel.twitchChannelId, accessToken, userId: bot.twitchUserId, first: 1 });
      const isModerator = mods.data.length > 0;
      const checkedAt = new Date();
      await prisma.channelBotStatus.upsert({ where: { channelId }, create: { channelId, platformBotId: bot.id, status: isModerator ? 'ready' : 'not_moderator', isModerator, lastCheckedAt: checkedAt, lastError: isModerator ? null : 'not_moderator' }, update: { platformBotId: bot.id, status: isModerator ? 'ready' : 'not_moderator', isModerator, lastCheckedAt: checkedAt, lastError: isModerator ? null : 'not_moderator' } });
      return { platformBotConnected: true, botLogin: bot.twitchLogin, botDisplayName: bot.displayName, moderatorStatus: isModerator ? 'verified_moderator' : 'not_moderator', isModerator, canSendAsPlatformBot: isModerator, lastCheckedAt: checkedAt.toISOString(), instruction: `/mod ${bot.twitchLogin}`, canAutoAddModerator: missingScopes.length === 0, missingScopes: [] };
    } catch (e: any) {
      if (e instanceof TwitchApiError) { await prisma.channelBotStatus.upsert({ where: { channelId }, create: { channelId, platformBotId: bot.id, status: 'api_failed', isModerator: false, lastCheckedAt: new Date(), lastError: e.safeMessage }, update: { platformBotId: bot.id, status: 'api_failed', isModerator: false, lastCheckedAt: new Date(), lastError: e.safeMessage } }); return problem('twitch.platform_bot.api_failed', 502, 'Twitch API Fehler beim Abruf der Moderatorliste.', { twitchStatus: e.status, twitchSafeMessage: e.safeMessage }); }
      await prisma.channelBotStatus.upsert({ where: { channelId }, create: { channelId, platformBotId: bot.id, status: 'check_failed', isModerator: false, lastCheckedAt: new Date(), lastError: 'check_failed' }, update: { platformBotId: bot.id, status: 'check_failed', isModerator: false, lastCheckedAt: new Date(), lastError: 'check_failed' } });
      return problem('twitch.platform_bot.check_failed', 500, 'Unerwarteter Fehler bei der Moderatorstatus-Prüfung.');
    }
  });

  app.post('/api/channels/:channelId/twitch/bot/add-moderator', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const role = (req as AuthedRequest).session.channelRoles[channelId] || (req as AuthedRequest).session.role;
    if (role === 'channel_moderator') return rep.code(403).send({ errorCode: 'permission.denied' });
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    const bot = await prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
    const token = await prisma.twitchToken.findUnique({ where: { channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    if (!bot) return rep.code(400).send({ errorCode: 'twitch.platform_bot.not_configured' });
    if (!token) return rep.code(400).send({ errorCode: 'twitch.platform_bot.channel_token_missing' });
    let accessToken = ''; let refreshToken = ''; let scopes: string[] = [];
    try { accessToken = decryptSecret(token.accessTokenEncrypted); refreshToken = decryptSecret(token.refreshTokenEncrypted); scopes = JSON.parse(token.scopesJson || '[]'); } catch { return rep.code(400).send({ errorCode: 'twitch.platform_bot.channel_token_missing' }); }
    if (token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      try { const refreshed = await twitchApi.refreshAccessToken(refreshToken); accessToken = refreshed.access_token; scopes = refreshed.scope ?? scopes; await prisma.twitchToken.update({ where: { channelId }, data: { accessTokenEncrypted: encryptSecret(refreshed.access_token), refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken), expiresAt: new Date(Date.now() + refreshed.expires_in * 1000), scopesJson: JSON.stringify(scopes) } }); } catch { return rep.code(400).send({ errorCode: 'twitch.platform_bot.channel_token_missing' }); }
    }
    const missingScopes = [platformBotModeratorScope].filter((scope) => !scopes.includes(scope));
    if (missingScopes.length) return rep.code(400).send({ errorCode: 'twitch.platform_bot.scope_missing', missingScopes, hint: 'Bitte Twitch-Kanal erneut verbinden.' });
    try {
      try { await twitchApi.addChannelModerator({ broadcasterId: channel.twitchChannelId, userId: bot.twitchUserId, accessToken }); } catch (e: any) { if (!(e instanceof TwitchApiError) || e.status !== 409) throw e; }
      const mods = await twitchApi.getChannelModerators({ broadcasterId: channel.twitchChannelId, accessToken, userId: bot.twitchUserId, first: 1 });
      const isModerator = mods.data.length > 0;
      const checkedAt = new Date();
      await prisma.channelBotStatus.upsert({ where: { channelId }, create: { channelId, platformBotId: bot.id, status: isModerator ? 'ready' : 'not_moderator', isModerator, lastCheckedAt: checkedAt, lastError: isModerator ? null : 'not_moderator' }, update: { platformBotId: bot.id, status: isModerator ? 'ready' : 'not_moderator', isModerator, lastCheckedAt: checkedAt, lastError: isModerator ? null : 'not_moderator' } });
      await prisma.auditLog.create({ data: { channelId, userId: (req as AuthedRequest).session.id, action: 'twitch.platform_bot.add_moderator', detailsJson: JSON.stringify({ botLogin: bot.twitchLogin, botTwitchUserId: bot.twitchUserId, isModerator }) } });
      await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'platform_bot_added_as_moderator', payloadJson: JSON.stringify({ botLogin: bot.twitchLogin, botTwitchUserId: bot.twitchUserId, isModerator }) } });
      return { ok: true, botLogin: bot.twitchLogin, isModerator, checkedAt: checkedAt.toISOString(), instruction: `/mod ${bot.twitchLogin}` };
    } catch (e: any) {
      if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.platform_bot.add_moderator_failed', status: e.status, safeMessage: e.safeMessage });
      return rep.code(502).send({ errorCode: 'twitch.platform_bot.add_moderator_failed' });
    }
  });

  app.get('/api/channels/:channelId/twitch/debug', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const [channel, bot, botStatus, token] = await Promise.all([
      prisma.channel.findUnique({ where: { id: channelId } }),
      prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.channelBotStatus.findUnique({ where: { channelId } }),
      prisma.twitchToken.findUnique({ where: { channelId } })
    ]);
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const managerHealth = (await import('../twitch/managerSingleton.js')).twitchConnectionManager.health();
    const session = managerHealth.sessions.find((s: any) => s.channelId === channelId);
    const lastStored = await prisma.chatMessage.findFirst({ where: { channelId }, orderBy: { createdAt: 'desc' } });
    const dayCount = await prisma.chatMessage.count({ where: { channelId, createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } });
    const duplicateMessagesSkippedLast24h = await prisma.botEvent.count({ where: { channelId, eventType: 'chat_message_duplicate_skipped', createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } });
    const eventStats = eventBus.getChannelStats(channelId);
    const scopes = token ? JSON.parse(token.scopesJson || '[]') : [];
    return {
      channel: { id: channel.id, twitchLogin: channel.twitchLogin, twitchChannelId: channel.twitchChannelId, isActive: channel.isActive, botEnabled: channel.botEnabled },
      eventSub: { enabled: managerHealth.eventSubEnabled, transportKey: session?.transportKey ?? null, connected: Boolean(managerHealth.transports?.find((t: any) => t.key === session?.transportKey)?.connected), sessionIdPresent: Boolean(managerHealth.transports?.find((t: any) => t.key === session?.transportKey)?.sessionIdPresent), lastWelcomeAt: managerHealth.transports?.find((t: any) => t.key === session?.transportKey)?.lastWelcomeAt ?? null, lastError: managerHealth.transports?.find((t: any) => t.key === session?.transportKey)?.lastError ?? null },
      session: { exists: Boolean(session), status: session?.status ?? 'missing', connected: Boolean(session?.connected), subscribed: Boolean(session?.subscribed), subscriptionsCount: session?.subscriptionsCount ?? 0, lastConnectedAt: session?.lastConnectedAt ?? null, lastSubscriptionAt: session?.lastSubscriptionAt ?? null, lastMessageAt: session?.lastMessageAt ?? null, lastError: session?.lastError ?? null },
      chat: { lastStoredMessageAt: lastStored?.createdAt ?? null, storedMessagesLast24h: dayCount, duplicateMessagesSkippedLast24h },
      liveStream: eventStats,
      tokens: { hasBroadcasterToken: Boolean(token), broadcasterScopes: scopes, hasPlatformBotToken: Boolean(bot?.accessTokenEncrypted), platformBotScopes: bot ? JSON.parse(bot.scopesJson || '[]') : [] },
      platformBot: { connected: Boolean(bot), moderatorStatus: botStatus?.status ?? 'unknown', canSendAsPlatformBot: Boolean(botStatus?.isModerator) }
    };
  });


};
export default channelsRoutes;
