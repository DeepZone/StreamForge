import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { verifyPassword } from '../auth/password.js';
import { clearSession, setSession } from '../auth/session.js';
import { requireAuth, AuthedRequest } from '../auth/guards.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/login', async (req: any, rep) => {
    const u = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
    if (!u || !u.passwordHash || !(await verifyPassword(u.passwordHash, req.body.password))) {
      return rep.code(401).send({ error: 'invalid_credentials' });
    }
    const members = await prisma.channelMember.findMany({ where: { userId: u.id } });
    const channelRoles = Object.fromEntries(members.map((x) => [x.channelId, x.role]));
    const role = (members.find((x) => x.role === 'system_owner')?.role ?? members.find((x) => x.role === 'platform_admin')?.role ?? 'viewer') as Role;
    setSession(rep, { id: u.id, role, channelRoles });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, rep) => {
    clearSession(rep);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => ({ session: (req as AuthedRequest).session }));
};
export default authRoutes;
