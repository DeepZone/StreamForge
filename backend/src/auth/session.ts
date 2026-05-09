import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export type SessionUser = { id: string; role: string; channelRoles: Record<string, string> };

const baseCookieOptions = {
  httpOnly: true,
  sameSite: env.cookieSameSite,
  secure: env.nodeEnv === 'production' || env.cookieSecure
} as const;

const sessionCookieOptions = {
  ...baseCookieOptions,
  path: '/',
  maxAge: 60 * 60 * 8
} as const;

const twitchStateCookieOptions = {
  ...baseCookieOptions,
  path: '/api/auth/twitch',
  maxAge: 60 * 10
} as const;

export const setSession = (reply: FastifyReply, user: SessionUser) =>
  reply.setCookie('sf_session', JSON.stringify(user), { ...sessionCookieOptions, signed: true });

export const clearSession = (reply: FastifyReply) => reply.clearCookie('sf_session', sessionCookieOptions);

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

export const setTwitchOAuthState = (reply: FastifyReply, state: string) =>
  reply.setCookie('sf_twitch_oauth_state', state, { ...twitchStateCookieOptions, signed: true });

export const getTwitchOAuthState = (req: FastifyRequest): string | null => {
  const signedValue = (req.cookies as Record<string, string>).sf_twitch_oauth_state;
  if (!signedValue) return null;
  const unsigned = req.unsignCookie(signedValue);
  if (!unsigned.valid || !unsigned.value) return null;
  return unsigned.value;
};

export const clearTwitchOAuthState = (reply: FastifyReply) => reply.clearCookie('sf_twitch_oauth_state', twitchStateCookieOptions);
