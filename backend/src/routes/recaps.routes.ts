import { Role } from '@prisma/client';
import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, isAdmin, requireAuth, requireChannelRole } from '../auth/guards.js';
import { generateRecap } from '../services/recapService.js';
import { audit } from '../services/auditService.js';

const recapsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/recaps', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    return prisma.streamRecap.findMany({ where: { channelId: req.params.channelId }, orderBy: { createdAt: 'desc' }, take: 50 });
  });

  app.post('/api/channels/:channelId/recaps', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_moderator');
    return generateRecap(req.params.channelId, req.body || {});
  });

  app.delete('/api/channels/:channelId/recaps/:recapId', { preHandler: requireAuth }, async (req: any, rep) => {
    const authed = req as AuthedRequest;
    await requireChannelRole(authed, rep, 'channel_admin');
    const role = authed.session.channelRoles[req.params.channelId] as Role | undefined;
    if (!isAdmin(authed.session.role as Role) && role !== 'channel_owner' && role !== 'channel_admin') return rep.code(403).send({ errorCode: 'forbidden' });
    const recap = await prisma.streamRecap.findFirst({ where: { id: req.params.recapId, channelId: req.params.channelId } });
    if (!recap) return rep.code(404).send({ errorCode: 'recap.not_found' });
    await prisma.streamRecap.delete({ where: { id: recap.id } });
    await audit('recap.delete', authed.session.id, req.params.channelId, { recapId: recap.id });
    return { ok: true };
  });
};

export default recapsRoutes;
