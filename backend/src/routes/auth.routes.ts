import crypto from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { verifyPassword } from '../auth/password.js';
import { clearSession, setSession } from '../auth/session.js';
import { requireAuth, AuthedRequest } from '../auth/guards.js';
import { assertTwitchOAuthConfig, env } from '../config/env.js';
import { TwitchApi } from '../twitch/TwitchApi.js';
import { encryptSecret } from '../utils/crypto.js';
import { TWITCH_MVP_SCOPES } from '../twitch/scopes.js';

const twitchScopes = [...TWITCH_MVP_SCOPES];
const twitchApi = new TwitchApi();

const buildSessionForUser = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const members = await prisma.channelMember.findMany({ where: { userId } });
  const channelRoles = Object.fromEntries(members.map((x) => [x.channelId, x.role]));
  const role = (members.find((x) => x.role === 'system_owner')?.role ?? members.find((x) => x.role === 'platform_admin')?.role ?? 'viewer') as Role;
  return {
    session: { id: user.id, role, channelRoles },
    responseUser: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      twitchLogin: user.twitchLogin,
      avatarUrl: user.avatarUrl,
      role,
      channels: members.map((m) => ({ channelId: m.channelId, role: m.role }))
    }
  };
};

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/login', async (req: any, rep) => {
    const u = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
    if (!u || !u.passwordHash || !(await verifyPassword(u.passwordHash, req.body.password))) {
      return rep.code(401).send({ error: 'invalid_credentials' });
    }
    const { session } = await buildSessionForUser(u.id);
    setSession(rep, session);
    return { ok: true };
  });

  app.get('/api/auth/twitch/start', async (req: any, rep) => {
    try {
      assertTwitchOAuthConfig();
      const state = crypto.randomBytes(32).toString('hex');
      req.sessionTwitchState = state;
      setSession(rep, { ...(req.session || {}), twitchState: state } as any);
      const url = new URL('https://id.twitch.tv/oauth2/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', env.twitchClientId);
      url.searchParams.set('redirect_uri', env.twitchRedirectUri);
      url.searchParams.set('scope', twitchScopes.join(' '));
      url.searchParams.set('state', state);
      return rep.redirect(url.toString());
    } catch (error) {
      app.log.error({ error }, 'twitch oauth start unavailable');
      return rep.code(500).send({ error: 'twitch_oauth_not_configured' });
    }
  });

  app.get('/api/auth/twitch/callback', async (req: any, rep) => {
    try {
      assertTwitchOAuthConfig();
      const { code, state } = req.query as { code?: string; state?: string };
      const currentSession = req.cookies?.sf_session ? JSON.parse(Buffer.from(req.cookies.sf_session, 'base64').toString()) : null;
      if (!code || !state || !currentSession?.twitchState || state !== currentSession.twitchState) {
        return rep.code(400).send({ error: 'invalid_state_or_code' });
      }
      const tokens = await twitchApi.exchangeCodeForToken(code);
      const twitchUser = await twitchApi.getCurrentUser(tokens.access_token);

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { twitchUserId: twitchUser.id },
          create: { twitchUserId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url },
          update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }
        });
        const channel = await tx.channel.upsert({
          where: { twitchChannelId: twitchUser.id },
          create: { twitchChannelId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url },
          update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }
        });
        await tx.channelSettings.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id }, update: {} });
        await tx.command.upsert({
          where: { channelId_name: { channelId: channel.id, name: 'ping' } },
          create: { channelId: channel.id, name: 'ping', aliasesJson: '[]', response: 'pong', conditionsJson: '{}' },
          update: {}
        });
        await tx.channelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId: user.id } },
          create: { channelId: channel.id, userId: user.id, role: 'channel_owner' },
          update: { role: 'channel_owner' }
        });
        await tx.twitchToken.upsert({
          where: { channelId: channel.id },
          create: {
            channelId: channel.id,
            accessTokenEncrypted: encryptSecret(tokens.access_token),
            refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
            scopesJson: JSON.stringify(tokens.scope),
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
          },
          update: {
            accessTokenEncrypted: encryptSecret(tokens.access_token),
            refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
            scopesJson: JSON.stringify(tokens.scope),
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
          }
        });
        return { user, channel };
      });

      const { session } = await buildSessionForUser(result.user.id);
      setSession(rep, session);
      return rep.redirect(`${env.frontendUrl}/dashboard/channels/${result.channel.id}`);
    } catch (error) {
      app.log.error({ error }, 'twitch oauth callback failed');
      return rep.code(500).send({ error: 'twitch_oauth_callback_failed' });
    }
  });

  app.post('/api/auth/logout', async (_req, rep) => {
    clearSession(rep);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    const { responseUser } = await buildSessionForUser((req as AuthedRequest).session.id);
    return responseUser;
  });
};
export default authRoutes;
