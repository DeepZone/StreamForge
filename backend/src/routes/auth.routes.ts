import crypto from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { verifyPassword } from '../auth/password.js';
import { clearSession, clearTwitchBotOAuthState, clearTwitchOAuthState, getTwitchBotOAuthState, getTwitchOAuthState, setSession, setTwitchBotOAuthState, setTwitchOAuthState } from '../auth/session.js';
import { requireAuth, AuthedRequest } from '../auth/guards.js';
import { assertTokenEncryptionKey, assertTwitchOAuthConfig, env, getMissingTwitchOAuthEnvVars, isTokenEncryptionKeyValid } from '../config/env.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { encryptSecret } from '../utils/crypto.js';
import { TWITCH_BOT_ACCOUNT_SCOPES, TWITCH_BROADCASTER_SCOPES } from '../twitch/scopes.js';

const twitchApi = new TwitchApi();
const twitchScopes = [...TWITCH_BROADCASTER_SCOPES];

const baseProblem = (req: any, errorCode: string, status: number, detail: string, debug?: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { errorCode, status, detail, requestId: req.id, path: req.url, method: req.method, timestamp: new Date().toISOString() };
  if (debug) payload.debug = debug;
  return payload;
};

const sendProblem = (req: any, rep: any, errorCode: string, status: number, detail: string, debug?: Record<string, unknown>) =>
  rep.code(status).send(baseProblem(req, errorCode, status, detail, debug));

const twitchDebug = () => ({
  redirectUriUsed: env.twitchRedirectUri,
  publicApiUrl: env.publicApiUrl,
  publicAppUrl: env.publicAppUrl,
  hasClientId: Boolean(env.twitchClientId),
  hasClientSecret: Boolean(env.twitchClientSecret),
  hasTokenEncryptionKey: Boolean(env.tokenKey),
  tokenEncryptionKeyValid: isTokenEncryptionKeyValid()
});

const buildSessionForUser = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const members = await prisma.channelMember.findMany({ where: { userId } });
  const channelRoles = Object.fromEntries(members.map((x) => [x.channelId, x.role]));
  const role = (members.find((x) => x.role === 'system_owner')?.role ?? members.find((x) => x.role === 'platform_admin')?.role ?? 'viewer') as Role;
  return { session: { id: user.id, role, channelRoles }, responseUser: { id: user.id, displayName: user.displayName, email: user.email, twitchLogin: user.twitchLogin, avatarUrl: user.avatarUrl, role, channels: members.map((m) => ({ channelId: m.channelId, role: m.role })) } };
};

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/login', async (req: any, rep) => {
    const email = typeof req?.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req?.body?.password === 'string' ? req.body.password : '';
    if (!email) return rep.code(400).send({ error: 'email_required' });
    if (!password) return rep.code(400).send({ error: 'password_required' });
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || !u.passwordHash || !(await verifyPassword(u.passwordHash, password))) return rep.code(401).send({ error: 'invalid_credentials' });
    const { session } = await buildSessionForUser(u.id);
    setSession(rep, session);
    return { ok: true };
  });

  app.get('/api/auth/twitch/start', async (req: any, rep) => {
    try {
      assertTwitchOAuthConfig();
    } catch {
      return sendProblem(req, rep, 'twitch.oauth.not_configured', 500, 'Twitch OAuth ist nicht vollständig konfiguriert.', { ...twitchDebug(), missingEnvVars: getMissingTwitchOAuthEnvVars() });
    }
    const state = crypto.randomBytes(32).toString('hex');
    setTwitchOAuthState(rep, state);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.twitchClientId);
    url.searchParams.set('redirect_uri', env.twitchRedirectUri);
    url.searchParams.set('scope', twitchScopes.join(' '));
    url.searchParams.set('state', state);
    return rep.code(302).redirect(url.toString());
  });

  app.get('/api/auth/twitch/callback', async (req: any, rep) => {
    const query = req.query as { code?: string; state?: string; error?: string; error_description?: string };
    if (query.error) {
      return sendProblem(req, rep, 'twitch.oauth.provider_error', 400, 'Twitch OAuth wurde vom Provider abgelehnt.', { ...twitchDebug(), providerError: query.error, providerDescription: query.error_description, hint: 'Prüfe Redirect URI und Twitch App Konfiguration.' });
    }
    if (!query.code) return sendProblem(req, rep, 'twitch.oauth.missing_code', 400, 'Twitch Callback enthält keinen OAuth-Code.', twitchDebug());
    if (!query.state) return sendProblem(req, rep, 'twitch.oauth.missing_state', 400, 'Twitch Callback enthält keinen OAuth-State.', twitchDebug());

    const storedState = getTwitchOAuthState(req);
    if (!storedState || storedState !== query.state) {
      clearTwitchOAuthState(rep);
      return sendProblem(req, rep, 'twitch.oauth.invalid_state', 400, 'OAuth-State ist ungültig oder abgelaufen.', twitchDebug());
    }

    try {
      assertTwitchOAuthConfig();
      assertTokenEncryptionKey();
      const tokens = await twitchApi.exchangeCodeForToken(query.code);
      const twitchUser = await twitchApi.getCurrentUser(tokens.access_token);
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
      clearTwitchOAuthState(rep);
      const { session } = await buildSessionForUser(result.user.id);
      setSession(rep, session);
      return rep.redirect(`${env.publicAppUrl}/dashboard/channels/${result.channel.id}`);
    } catch (error: any) {
      if (error instanceof TwitchApiError && error.context === 'exchange_code') return sendProblem(req, rep, 'twitch.oauth.token_exchange_failed', error.status >= 500 ? 502 : 400, 'OAuth-Code konnte nicht gegen Twitch-Tokens getauscht werden.', { ...twitchDebug(), providerError: error.safeMessage });
      if (error instanceof TwitchApiError && error.context === 'get_current_user') return sendProblem(req, rep, 'twitch.oauth.userinfo_failed', 502, 'Twitch-Userdaten konnten nicht geladen werden.', twitchDebug());
      if (/TOKEN_ENCRYPTION_KEY/u.test(String(error?.message || ''))) return sendProblem(req, rep, 'twitch.oauth.token_encryption_failed', 500, 'TOKEN_ENCRYPTION_KEY ist nicht korrekt konfiguriert.', twitchDebug());
      const cause = error?.cause ?? error;
      if (cause instanceof Prisma.PrismaClientKnownRequestError || cause instanceof Prisma.PrismaClientValidationError || cause instanceof Prisma.PrismaClientUnknownRequestError) return sendProblem(req, rep, 'twitch.oauth.persistence_failed', 500, 'Twitch-Konto konnte nicht gespeichert werden.', { ...twitchDebug(), failedStep: error?.step ?? 'unknown' });
      app.log.error({ requestId: req.id, error }, 'twitch oauth callback failed');
      return sendProblem(req, rep, 'twitch.oauth.callback_failed', 500, 'Unerwarteter Fehler im OAuth-Callback.', twitchDebug());
    }
  });

  app.get('/api/auth/twitch/bot/callback', async (req: any, rep) => {
    const query = req.query as { code?: string; state?: string; error?: string; error_description?: string };
    if (query.error) return sendProblem(req, rep, 'twitch.bot_oauth.provider_error', 400, 'Twitch Bot OAuth wurde vom Provider abgelehnt.');
    if (!query.code || !query.state) return sendProblem(req, rep, 'twitch.bot_oauth.invalid_callback', 400, 'OAuth-Callback ist unvollständig.');
    const stateRaw = getTwitchBotOAuthState(req);
    if (!stateRaw || stateRaw !== query.state) {
      clearTwitchBotOAuthState(rep);
      return sendProblem(req, rep, 'twitch.bot_oauth.invalid_state', 400, 'OAuth-State ist ungültig oder abgelaufen.');
    }
    const stateData = req.unsignCookie((req.cookies as any).sf_twitch_bot_oauth_meta);
    if (!stateData?.valid || !stateData?.value) return sendProblem(req, rep, 'twitch.bot_oauth.invalid_state_payload', 400, 'OAuth-State Kontext fehlt.');
    const parsed = JSON.parse(stateData.value) as { channelId: string };
    try {
      const tokens = await twitchApi.exchangeCodeForToken(query.code);
      const twitchUser = await twitchApi.getCurrentUser(tokens.access_token);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      await prisma.$transaction(async (tx) => {
        const bot = await tx.twitchBotAccount.upsert({
          where: { twitchUserId: twitchUser.id },
          create: { twitchUserId: twitchUser.id, twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url, accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson: JSON.stringify(tokens.scope ?? []), expiresAt },
          update: { twitchLogin: twitchUser.login, displayName: twitchUser.display_name, avatarUrl: twitchUser.profile_image_url, accessTokenEncrypted: encryptSecret(tokens.access_token), refreshTokenEncrypted: encryptSecret(tokens.refresh_token), scopesJson: JSON.stringify(tokens.scope ?? []), expiresAt }
        });
        await tx.channelBotAccount.upsert({ where: { channelId: parsed.channelId }, create: { channelId: parsed.channelId, twitchBotAccountId: bot.id, enabled: true }, update: { twitchBotAccountId: bot.id, enabled: true } });
      });
      clearTwitchBotOAuthState(rep);
      rep.clearCookie('sf_twitch_bot_oauth_meta', { path: '/api/auth/twitch/bot' });
      return rep.redirect(`${env.publicAppUrl}/dashboard/channels/${parsed.channelId}/integrations`);
    } catch (error: any) {
      return sendProblem(req, rep, 'twitch.bot_oauth.callback_failed', 500, 'Bot-Account konnte nicht verbunden werden.');
    }
  });

  app.post('/api/auth/logout', async (_req, rep) => { clearSession(rep); return { ok: true }; });
  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => (await buildSessionForUser((req as AuthedRequest).session.id)).responseUser);
};

export default authRoutes;
