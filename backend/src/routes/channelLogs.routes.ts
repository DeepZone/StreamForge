import { FastifyPluginAsync } from 'fastify';
import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const channelLogsRoutes: FastifyPluginAsync = async (app) => {
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
export default channelLogsRoutes;
