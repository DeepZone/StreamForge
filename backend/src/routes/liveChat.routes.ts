import { FastifyPluginAsync } from 'fastify';
import { Platform } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { eventBus } from '../core/EventBus.js';
import { getBroadcasterTokenForChannel } from '../services/twitchTokenService.js';

const twitchApi = new TwitchApi();
const liveChatSendSchema = z.object({ message: z.string().max(500), replyParentMessageId: z.string().max(128).optional() }).strict();

const liveChatRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/chat/messages', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const q = req.query as { limit?: string; before?: string };
    const limit = Math.min(Math.max(Number(q.limit || 100), 1), 500);
    const beforeDate = q.before ? new Date(q.before) : undefined;
    const items = await prisma.chatMessage.findMany({ where: { channelId, ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}) }, orderBy: { createdAt: 'desc' }, take: limit });
    return { items };
  });
  app.get('/api/channels/:channelId/live/chat/stream', { preHandler: requireAuth }, async (req, rep) => { /* unchanged */
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator'); const { channelId } = req.params as { channelId: string }; rep.raw.setHeader('Content-Type', 'text/event-stream'); rep.raw.setHeader('Cache-Control', 'no-cache, no-transform'); rep.raw.setHeader('Connection', 'keep-alive'); rep.raw.setHeader('X-Accel-Buffering', 'no'); rep.hijack(); const writeEvent = (name: string, event: Record<string, unknown>) => { rep.raw.write(`event: ${name}\n`); rep.raw.write(`data: ${JSON.stringify(event)}\n\n`); }; const safeWriteEvent = (name: string, event: Record<string, unknown>) => { try { writeEvent(name, event); return true; } catch { return false; } }; safeWriteEvent('system.connected', { type: 'system.connected', channelId, createdAt: new Date().toISOString() }); const handler = (event: any) => { if (!safeWriteEvent(event?.type === 'chat.message' ? 'chat.message' : 'message', event)) cleanup(); }; const cleanup = () => { clearInterval(keepalive); eventBus.unsubscribe(channelId, handler); app.log.info({ event: 'live_chat_sse_disconnected', channelId, subscriberCount: eventBus.getChannelStats(channelId).subscribers }, 'live chat sse disconnected'); if (!rep.raw.writableEnded) rep.raw.end(); }; eventBus.subscribe(channelId, handler); app.log.info({ event: 'live_chat_sse_connected', channelId, subscriberCount: eventBus.getChannelStats(channelId).subscribers }, 'live chat sse connected'); const keepalive = setInterval(() => { if (!safeWriteEvent('ping', { type: 'ping', createdAt: new Date().toISOString() })) cleanup(); }, 20000); req.raw.on('close', cleanup);
  });
  app.post('/api/channels/:channelId/live/chat/send', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const body = liveChatSendSchema.safeParse(req.body ?? {}); if (!body.success) return rep.code(400).send({ errorCode: 'validation.failed', details: body.error.issues });
    const { channelId } = req.params as { channelId: string }; const message = body.data.message.trim(); if (!message) return rep.code(400).send({ errorCode: 'validation.failed', details: [{ message: 'message required' }] });
    const channel = await prisma.channel.findUnique({ where: { id: channelId } }); if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const token = await getBroadcasterTokenForChannel(channelId); if (!token) return rep.code(400).send({ errorCode: 'twitch.live_chat.auth_required' });
    if (!token.scopes.includes('user:write:chat')) return rep.code(400).send({ errorCode: 'twitch.live_chat.scope_missing', hint: 'Bitte Twitch erneut verbinden, damit StreamForge als Streamer schreiben darf.' });
    try { const response = await twitchApi.sendChatMessage({ broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken: token.accessToken, message, replyParentMessageId: body.data.replyParentMessageId }); const result = response?.data?.[0] ?? {}; const isSent = result?.is_sent === true; if (!isSent) { await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_failed', payloadJson: JSON.stringify({ dropReason: result?.drop_reason ?? null }) } }); await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_failed', detailsJson: JSON.stringify({ dropReason: result?.drop_reason ?? null }) } }); return rep.code(400).send({ errorCode: 'twitch.live_chat.dropped', ok: false, isSent: false, dropReason: result?.drop_reason ?? { code: 'unknown', message: 'Message dropped by Twitch.' } }); } await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_sent', payloadJson: JSON.stringify({ messageId: result?.message_id ?? null }) } }); await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_sent', detailsJson: JSON.stringify({ messageId: result?.message_id ?? null }) } }); return { ok: true, messageId: result?.message_id ?? null, isSent: true }; } catch (e) { await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType: 'live_chat_manual_message_failed', payloadJson: JSON.stringify({ reason: 'api_failed' }) } }); await prisma.auditLog.create({ data: { channelId, userId: req.session.userId, action: 'live_chat_manual_message_failed', detailsJson: JSON.stringify({ reason: 'api_failed' }) } }); if (e instanceof TwitchApiError) return rep.code(502).send({ errorCode: 'twitch.live_chat.send_failed', status: e.status, message: e.safeMessage }); return rep.code(502).send({ errorCode: 'twitch.live_chat.send_failed' }); }
  });
};
export default liveChatRoutes;
