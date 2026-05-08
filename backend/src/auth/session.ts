import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export type SessionUser = { id: string; role: string; channelRoles: Record<string, string>; twitchState?: string };

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: env.cookieSameSite,
  secure: env.nodeEnv === 'production' || env.cookieSecure,
  maxAge: 60 * 60 * 8
} as const;

export const setSession = (reply: FastifyReply, user: SessionUser) =>
  reply.setCookie('sf_session', JSON.stringify(user), { ...cookieOptions, signed: true });

export const clearSession = (reply: FastifyReply) => reply.clearCookie('sf_session', cookieOptions);

export const getSession = (req: FastifyRequest): SessionUser | null => {
  const signedValue = (req.cookies as Record<string, string>).sf_session;
  if (!signedValue) return null;
  const unsigned = req.unsignCookie(signedValue);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    return JSON.parse(unsigned.value) as SessionUser;
  } catch {
    return null;
  }
};
