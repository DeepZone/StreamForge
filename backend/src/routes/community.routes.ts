import { FastifyPluginAsync } from 'fastify';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { getCommunityRadar } from '../services/communityService.js';

const communityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/community/radar', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    return getCommunityRadar(channelId, req.query as { range?: string });
  });
};

export default communityRoutes;
