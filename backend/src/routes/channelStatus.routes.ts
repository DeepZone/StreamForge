import { FastifyPluginAsync } from 'fastify';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { getChannelTwitchStatus } from '../services/channelStatusService.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/twitch/status', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    const { channelId } = req.params as { channelId: string };
    const status = await getChannelTwitchStatus(channelId);
    if (!status) return rep.code(404).send({ errorCode: 'channel.not_found' });
    return status;
  });
};

export default routes;
