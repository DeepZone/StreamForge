import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { isAdmin, requireAuth, AuthedRequest } from '../auth/guards.js';

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/admin/health', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    return { ok: true, db: 'up' };
  });
};
export default adminRoutes;
