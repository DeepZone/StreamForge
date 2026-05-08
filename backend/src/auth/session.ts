import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export type SessionUser = { id: string; role: string; channelRoles: Record<string, string> };

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.nodeEnv === 'production'
};

export const setSession = (reply: FastifyReply, user: SessionUser) =>
  reply.setCookie('sf_session', Buffer.from(JSON.stringify(user)).toString('base64'), cookieOptions);

export const clearSession = (reply: FastifyReply) => reply.clearCookie('sf_session', cookieOptions);

export const getSession = (req: FastifyRequest): SessionUser | null => {
  try {
    return JSON.parse(Buffer.from((req.cookies as Record<string, string>).sf_session || '', 'base64').toString());
  } catch {
    return null;
  }
};
