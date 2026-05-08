import { FastifyPluginAsync } from 'fastify';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { detectFaq, resolveRange } from '../services/analyticsService.js';
import { getCommunityRadar } from '../services/communityService.js';

const communityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/community/radar', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    const { channelId } = req.params as { channelId: string };
    return getCommunityRadar(channelId, req.query as any);
  });

  app.get('/api/channels/:channelId/community/faq', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep);
    const { channelId } = req.params as { channelId: string };
    return detectFaq(channelId, resolveRange(req.query as any));
  });
};

export default communityRoutes;
