import crypto from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { verifyPassword } from '../auth/password.js';
import { clearSession, getSession, setSession } from '../auth/session.js';
import { requireAuth, AuthedRequest } from '../auth/guards.js';
import { assertTokenEncryptionKey, assertTwitchOAuthConfig, env, getMissingTwitchOAuthEnvVars } from '../config/env.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { encryptSecret } from '../utils/crypto.js';
import { TWITCH_MVP_SCOPES } from '../twitch/scopes.js';

const twitchScopes = [...TWITCH_MVP_SCOPES];
const twitchApi = new TwitchApi();

type CallbackErrorCode =
  | 'twitch.oauth.missing_code'
  | 'twitch.oauth.missing_state'
  | 'twitch.oauth.invalid_state'
  | 'twitch.oauth.token_exchange_failed'
  | 'twitch.oauth.userinfo_failed'
  | 'twitch.oauth.token_encryption_failed'
  | 'twitch.oauth.persistence_failed'
  | 'twitch.oauth.callback_failed';

const createRequestId = () => crypto.randomUUID();

const buildCallbackDebug = () => ({
  redirectUriUsed: env.twitchRedirectUri,
  publicApiUrl: env.publicApiUrl,
  publicAppUrl: env.publicAppUrl,
  hasClientId: Boolean(env.twitchClientId),
  hasClientSecret: Boolean(env.twitchClientSecret),
  hasTokenEncryptionKey: Boolean(env.tokenKey)
});

const sendCallbackError = (rep: any, statusCode: number, errorCode: CallbackErrorCode, requestId: string, detail: string, debug?: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { errorCode, requestId, detail };
  if (env.nodeEnv !== 'production' && debug) payload.debug = debug;
  return rep.code(statusCode).send(payload);
};

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
    const email = typeof req?.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req?.body?.password === 'string' ? req.body.password : '';
    if (!email) return rep.code(400).send({ error: 'email_required' });
    if (!password) return rep.code(400).send({ error: 'password_required' });

    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || !u.passwordHash || !(await verifyPassword(u.passwordHash, password))) {
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
      setSession(rep, { ...(getSession(req) || {}), twitchState: state } as any);
      const url = new URL('https://id.twitch.tv/oauth2/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', env.twitchClientId);
      url.searchParams.set('redirect_uri', env.twitchRedirectUri);
      url.searchParams.set('scope', twitchScopes.join(' '));
      url.searchParams.set('state', state);
      return rep.redirect(url.toString());
    } catch (error) {
      const missingEnvVars = getMissingTwitchOAuthEnvVars();
      app.log.error({ error }, 'twitch oauth start unavailable');
      return rep.code(500).send({ error: 'twitch_oauth_not_configured', missingEnvVars });
    }
  });

  app.get('/api/auth/twitch/callback', async (req: any, rep) => {
    const requestId = createRequestId();
    try {
      assertTwitchOAuthConfig();
      const { code, state } = req.query as { code?: string; state?: string };
      const currentSession = getSession(req);

      if (!code) {
        return sendCallbackError(rep, 400, 'twitch.oauth.missing_code', requestId, 'OAuth-Code fehlt.');
      }
      if (!state) {
        return sendCallbackError(rep, 400, 'twitch.oauth.missing_state', requestId, 'OAuth-State fehlt.');
      }
      if (!currentSession?.twitchState || state !== currentSession.twitchState) {
        return sendCallbackError(rep, 400, 'twitch.oauth.invalid_state', requestId, 'OAuth-State ist ungültig oder abgelaufen.');
      }

      const { twitchState: _twitchState, ...sessionWithoutState } = currentSession;
      setSession(rep, sessionWithoutState as any);

      const tokens = await twitchApi.exchangeCodeForToken(code);
      const twitchUser = await twitchApi.getCurrentUser(tokens.access_token);
      assertTokenEncryptionKey();

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({ where: { twitchUserId: twitchUser.id }, create: { twitchUserId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }, update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url } });
        const channel = await tx.channel.upsert({ where: { twitchChannelId: twitchUser.id }, create: { twitchChannelId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }, update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url } });
        await tx.channelSettings.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id }, update: {} });
        await tx.command.upsert({ where: { channelId_name: { channelId: channel.id, name: 'ping' } }, create: { channelId: channel.id, name: 'ping', aliasesJson: '[]', response: 'pong', conditionsJson: '{}' }, update: {} });
        await tx.channelMember.upsert({ where: { channelId_userId: { channelId: channel.id, userId: user.id } }, create: { channelId: channel.id, userId: user.id, role: 'channel_owner' }, update: { role: 'channel_owner' } });
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        const scopesJson = JSON.stringify(tokens.scope ?? []);
        await tx.twitchToken.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id, accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson, expiresAt }, update: { accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson, expiresAt } });
        return { user, channel };
      });

      const { session } = await buildSessionForUser(result.user.id);
      setSession(rep, session);
      return rep.redirect(`${env.frontendUrl}/dashboard/channels/${result.channel.id}`);
    } catch (error: any) {
      const debugBase = buildCallbackDebug();
      if (error instanceof TwitchApiError && error.context === 'exchange_code') {
        app.log.warn({ requestId, status: error.status }, 'twitch oauth token exchange failed');
        return sendCallbackError(rep, error.status >= 500 ? 502 : 400, 'twitch.oauth.token_exchange_failed', requestId, 'Token Exchange mit Twitch fehlgeschlagen.', { ...debugBase, twitchStatus: error.status, twitchError: error.safeMessage });
      }
      if (error instanceof TwitchApiError && error.context === 'get_current_user') {
        app.log.warn({ requestId, status: error.status }, 'twitch oauth userinfo failed');
        return sendCallbackError(rep, 502, 'twitch.oauth.userinfo_failed', requestId, 'Twitch-Userdaten konnten nicht geladen werden.', { ...debugBase, twitchStatus: error.status, twitchError: error.safeMessage });
      }
      if (error instanceof Error && /TOKEN_ENCRYPTION_KEY|AES-256|Invalid TOKEN_ENCRYPTION_KEY/.test(error.message)) {
        app.log.error({ requestId }, 'token encryption key misconfigured');
        return sendCallbackError(rep, 500, 'twitch.oauth.token_encryption_failed', requestId, 'Token-Verschlüsselung ist nicht korrekt konfiguriert.', debugBase);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientValidationError || error instanceof Prisma.PrismaClientUnknownRequestError) {
        app.log.error({ requestId, prismaCode: (error as any).code }, 'twitch oauth persistence failed');
        return sendCallbackError(rep, 500, 'twitch.oauth.persistence_failed', requestId, 'Persistierung der OAuth-Daten fehlgeschlagen.');
      }
      app.log.error({ requestId, error }, 'twitch oauth callback failed');
      return sendCallbackError(rep, 500, 'twitch.oauth.callback_failed', requestId, 'Unerwarteter Fehler im OAuth-Callback.', debugBase);
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
