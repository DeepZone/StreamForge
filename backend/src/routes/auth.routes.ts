import crypto from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { verifyPassword } from '../auth/password.js';
import { clearSession, clearTwitchOAuthState, getSession, getTwitchOAuthState, setSession, setTwitchOAuthState } from '../auth/session.js';
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
  | 'twitch.oauth.provider_error'
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
      setTwitchOAuthState(rep, state);
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
      const query = req.query as { code?: string; state?: string; error?: string; error_description?: string };
      const { code, state } = query;

      if (query.error) {
        const hint = query.error === 'redirect_mismatch' ? 'Die konfigurierte Redirect-URI stimmt nicht exakt mit Twitch überein.' : 'Prüfe Twitch OAuth-Parameter und App-Konfiguration.';
        return rep.code(400).send({ errorCode: 'twitch.oauth.provider_error', requestId, providerError: query.error, providerDescription: query.error_description, hint });
      }
      if (!code) return sendCallbackError(rep, 400, 'twitch.oauth.missing_code', requestId, 'Twitch Callback enthält keinen OAuth-Code.');
      if (!state) return sendCallbackError(rep, 400, 'twitch.oauth.missing_state', requestId, 'Twitch Callback enthält keinen OAuth-State.');

      const storedState = getTwitchOAuthState(req);
      const hasSession = Boolean(getSession(req));
      const hasStoredState = Boolean(storedState);
      const hasReturnedState = Boolean(state);
      const cookiePresent = Boolean((req.cookies as Record<string, string>).sf_twitch_oauth_state);

      if (!storedState || state !== storedState) {
        clearTwitchOAuthState(rep);
        return sendCallbackError(rep, 400, 'twitch.oauth.invalid_state', requestId, 'OAuth-State ist ungültig oder abgelaufen.', { hasSession, hasStoredState, hasReturnedState, cookiePresent });
      }
      clearTwitchOAuthState(rep);

      const tokens = await twitchApi.exchangeCodeForToken(code);
      const twitchUser = await twitchApi.getCurrentUser(tokens.access_token);

      const hasTokenEncryptionKey = Boolean(env.tokenKey);
      const tokenKeyValid = /^[0-9a-fA-F]{64}$/u.test(env.tokenKey);
      if (!hasTokenEncryptionKey || !tokenKeyValid) {
        return sendCallbackError(rep, 500, 'twitch.oauth.token_encryption_failed', requestId, 'TOKEN_ENCRYPTION_KEY ist nicht korrekt konfiguriert.', { ...buildCallbackDebug(), hasTokenEncryptionKey, tokenKeyValid });
      }
      assertTokenEncryptionKey();

      const result = await prisma.$transaction(async (tx) => {
        let user; let channel;
        try {
          user = await tx.user.upsert({ where: { twitchUserId: twitchUser.id }, create: { twitchUserId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }, update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url } });
        } catch (error) { throw { step: 'user_upsert_failed', cause: error }; }
        try {
          channel = await tx.channel.upsert({ where: { twitchChannelId: twitchUser.id }, create: { twitchChannelId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url }, update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url } });
        } catch (error) { throw { step: 'channel_upsert_failed', cause: error }; }
        try { await tx.channelSettings.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id }, update: {} }); } catch (error) { throw { step: 'channel_settings_upsert_failed', cause: error }; }
        try { await tx.command.upsert({ where: { channelId_name: { channelId: channel.id, name: 'ping' } }, create: { channelId: channel.id, name: 'ping', aliasesJson: '[]', response: 'pong', conditionsJson: '{}' }, update: {} }); } catch (error) { throw { step: 'ping_command_upsert_failed', cause: error }; }
        try { await tx.channelMember.upsert({ where: { channelId_userId: { channelId: channel.id, userId: user.id } }, create: { channelId: channel.id, userId: user.id, role: 'channel_owner' }, update: { role: 'channel_owner' } }); } catch (error) { throw { step: 'channel_member_upsert_failed', cause: error }; }
        try {
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
          const scopesJson = JSON.stringify(tokens.scope ?? []);
          await tx.twitchToken.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id, accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson, expiresAt }, update: { accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson, expiresAt } });
        } catch (error) { throw { step: 'twitch_token_upsert_failed', cause: error }; }
        return { user, channel };
      });

      const { session } = await buildSessionForUser(result.user.id);
      setSession(rep, session);
      return rep.redirect(`${env.frontendUrl}/dashboard/channels/${result.channel.id}`);
    } catch (error: any) {
      const debugBase = buildCallbackDebug();
      if (error instanceof TwitchApiError && error.context === 'exchange_code') {
        app.log.warn({ requestId, status: error.status }, 'twitch oauth token exchange failed');
        return sendCallbackError(rep, error.status >= 500 ? 502 : 400, 'twitch.oauth.token_exchange_failed', requestId, 'OAuth-Code konnte nicht gegen Twitch-Tokens getauscht werden.', { ...debugBase, twitchStatus: error.status, twitchError: error.safeMessage });
      }
      if (error instanceof TwitchApiError && error.context === 'get_current_user') {
        app.log.warn({ requestId, status: error.status }, 'twitch oauth userinfo failed');
        return sendCallbackError(rep, 502, 'twitch.oauth.userinfo_failed', requestId, 'Twitch-Userdaten konnten nicht geladen werden.', { ...debugBase, twitchStatus: error.status, twitchError: error.safeMessage });
      }
      const failedStep = error?.step as string | undefined;
      const cause = error?.cause ?? error;
      if (failedStep && (cause instanceof Prisma.PrismaClientKnownRequestError || cause instanceof Prisma.PrismaClientValidationError || cause instanceof Prisma.PrismaClientUnknownRequestError)) {
        return sendCallbackError(rep, cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002' ? 409 : 500, 'twitch.oauth.persistence_failed', requestId, 'Twitch-Konto konnte nicht gespeichert werden.', { failedStep, prismaCode: (cause as any).code });
      }
      if (cause instanceof Prisma.PrismaClientKnownRequestError || cause instanceof Prisma.PrismaClientValidationError || cause instanceof Prisma.PrismaClientUnknownRequestError) {
        return sendCallbackError(rep, 500, 'twitch.oauth.persistence_failed', requestId, 'Twitch-Konto konnte nicht gespeichert werden.', { failedStep: 'unknown', prismaCode: (cause as any).code });
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
