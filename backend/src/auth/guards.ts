import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { getSession, SessionUser } from './session.js';

export type AuthedRequest = FastifyRequest & { session: SessionUser };

const roleRank: Record<Role, number> = {
  viewer: 0,
  channel_moderator: 1,
  channel_admin: 2,
  channel_owner: 3,
  platform_admin: 4,
  system_owner: 5
};

export const isAdmin = (role: Role) => role === 'system_owner' || role === 'platform_admin';

export const requireAuth = async (req: FastifyRequest, rep: FastifyReply) => {
  const session = getSession(req);
  if (!session) return rep.code(401).send({ error: 'unauthorized' });
  (req as AuthedRequest).session = session;
};

export const requireChannelRole = async (req: AuthedRequest, rep: FastifyReply, required: Role = 'viewer') => {
  if (isAdmin(req.session.role as Role)) return;
  const channelId = String((req.params as { channelId: string }).channelId);
  const channelRole = req.session.channelRoles[channelId] as Role | undefined;
  if (!channelRole || roleRank[channelRole] < roleRank[required]) {
    return rep.code(403).send({ error: 'forbidden' });
  }
};
