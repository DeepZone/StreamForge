import { FastifyPluginAsync } from 'fastify';
import { Platform, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, isAdmin, requireAuth, requireChannelRole } from '../auth/guards.js';

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
};
export default channelsRoutes;
