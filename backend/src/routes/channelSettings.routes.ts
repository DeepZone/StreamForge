import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const channelSettingsRoutes: FastifyPluginAsync = async (app) => {
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
    const bodySchema = z.object({ botEnabled: z.boolean().optional(), isActive: z.boolean().optional(), commandPrefix: z.string().min(1).max(5).optional(), language: z.enum(['de', 'en']).optional(), timezone: z.string().min(1).max(64).optional() }).strict();
    const parsed = bodySchema.safeParse(req.body || {});
    if (!parsed.success) return rep.code(400).send({ errorCode: 'validation.failed', details: parsed.error.issues });
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const data = parsed.data;
    await prisma.channel.update({ where: { id: channelId }, data: { ...(data.botEnabled !== undefined ? { botEnabled: data.botEnabled } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
    await prisma.channelSettings.upsert({ where: { channelId }, create: { channelId, ...(data.commandPrefix ? { commandPrefix: data.commandPrefix } : {}), ...(data.language ? { language: data.language } : {}), ...(data.timezone ? { timezone: data.timezone } : {}) }, update: { ...(data.commandPrefix ? { commandPrefix: data.commandPrefix } : {}), ...(data.language ? { language: data.language } : {}), ...(data.timezone ? { timezone: data.timezone } : {}) } });
    return { ok: true };
  });
};

export default channelSettingsRoutes;
