import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { hashPassword } from '../auth/password.js';
import { setSession } from '../auth/session.js';

const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/setup/status', async () => ({
    setupAllowed: !(await prisma.user.findFirst({ where: { isLocalAdmin: true, members: { some: { role: 'system_owner' } } } }))
  }));

  app.post('/api/setup/create-owner', async (req: any, rep) => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const exists = await tx.user.findFirst({ where: { isLocalAdmin: true, members: { some: { role: 'system_owner' } } } });
        if (exists) return null;
        const user = await tx.user.create({ data: { email: req.body.email.toLowerCase(), passwordHash: await hashPassword(req.body.password), displayName: req.body.displayName, isLocalAdmin: true } });
        const channel = await tx.channel.create({ data: { twitchChannelId: `sys-${user.id}`, twitchLogin: `system-${user.id.slice(-6)}`, displayName: 'System' } });
        await tx.channelMember.create({ data: { channelId: channel.id, userId: user.id, role: 'system_owner' } });
        return { user, channel };
      });
      if (!result) return rep.code(403).send({ error: 'setup disabled' });
      setSession(rep, { id: result.user.id, role: 'system_owner', channelRoles: { [result.channel.id]: 'system_owner' } });
      return { ok: true };
    } catch {
      return rep.code(409).send({ error: 'setup_conflict' });
    }
  });
};

export default setupRoutes;
