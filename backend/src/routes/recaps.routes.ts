import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { generateRecap } from '../services/recapService.js';

const recapsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/channels/:channelId/recaps/generate', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    return generateRecap(req.params.channelId, req.body || {});
  });
  app.get('/api/channels/:channelId/recaps', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    return prisma.streamRecap.findMany({ where: { channelId: req.params.channelId }, orderBy: { createdAt: 'desc' }, take: 50 });
  });
  app.get('/api/channels/:channelId/recaps/:recapId', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    return prisma.streamRecap.findFirst({ where: { id: req.params.recapId, channelId: req.params.channelId } });
  });
};

export default recapsRoutes;
