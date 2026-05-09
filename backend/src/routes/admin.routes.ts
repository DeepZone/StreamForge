import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { isAdmin, requireAuth, AuthedRequest } from '../auth/guards.js';
import { env, getMissingTwitchOAuthEnvVars, isTokenEncryptionKeyValid } from '../config/env.js';
import { TWITCH_BOT_ACCOUNT_SCOPES, TWITCH_BROADCASTER_SCOPES } from '../twitch/scopes.js';
import { twitchConnectionManager } from '../twitch/managerSingleton.js';
import { audit } from '../services/auditService.js';
import { getTimerWorkerHealth } from '../workers/timerWorker.js';
import { prisma } from '../db/prisma.js';

import crypto from 'crypto';
import { setTwitchBotOAuthState } from '../auth/session.js';


const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/admin/health', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const twitchHealth = twitchConnectionManager.health();
    const channelIds = twitchHealth.sessions.map((s: any) => s.channelId);
    const channels = channelIds.length ? await prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, displayName: true, twitchLogin: true, twitchChannelId: true } }) : [];
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const sessions = twitchHealth.sessions.map((s: any) => ({ ...s, ...channelMap.get(s.channelId) }));
    return { ok: true, db: 'up', backend: 'up', twitch: { eventSubEnabled: env.twitchEventSubEnabled, ...twitchHealth, sessions }, timerWorker: getTimerWorkerHealth() };
  });

  const ensureEnabled = (rep: any) => {
    if (!env.twitchEventSubEnabled) {
      rep.code(409).send({ error: 'eventsub_disabled' });
      return false;
    }
    return true;
  };


  app.get('/api/admin/twitch/config', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const missingEnvVars = [...getMissingTwitchOAuthEnvVars(), ...(!env.tokenKey ? ['TOKEN_ENCRYPTION_KEY'] : [])];
    return {
      oauthConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      redirectUri: env.twitchRedirectUri,
      publicApiUrl: env.publicApiUrl,
      publicAppUrl: env.publicAppUrl,
      eventSubEnabled: env.twitchEventSubEnabled,
      hasClientId: Boolean(env.twitchClientId),
      hasClientSecret: Boolean(env.twitchClientSecret),
      hasTokenEncryptionKey: Boolean(env.tokenKey),
      tokenEncryptionKeyValid: isTokenEncryptionKeyValid(),
      effectiveFrontendUrl: env.frontendUrl,
      effectiveBackendUrl: env.backendUrl,
      cookieSecure: env.nodeEnv === 'production' || env.cookieSecure,
      cookieSameSite: env.cookieSameSite,
      nodeEnv: env.nodeEnv,
      trustProxy: env.trustProxy,
      scopes: { broadcaster: [...TWITCH_BROADCASTER_SCOPES], botAccount: [...TWITCH_BOT_ACCOUNT_SCOPES] }
    };
  });

  app.get('/api/admin/twitch/platform-bot/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const state = crypto.randomBytes(32).toString('hex');
    setTwitchBotOAuthState(rep, state);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.twitchClientId);
    url.searchParams.set('redirect_uri', `${env.publicApiUrl}/auth/twitch/platform-bot/callback`);
    url.searchParams.set('scope', TWITCH_BOT_ACCOUNT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return rep.code(302).redirect(url.toString());
  });

  app.post('/api/admin/twitch/sessions/start-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const result = await twitchConnectionManager.startAll();
    await audit('admin_twitch_start_all', authed.session.id);
    return result;
  });
  app.post('/api/admin/twitch/sessions/stop-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const result = await twitchConnectionManager.stopAll();
    await audit('admin_twitch_stop_all', authed.session.id);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.startChannel(channelId);
      await audit('admin_twitch_start_channel', authed.session.id, channelId);
      return result;
    } catch (e: any) {
      return rep.code(400).send({ error: e?.message ?? 'start_failed' });
    }
  });
  app.post('/api/admin/twitch/sessions/:channelId/stop', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const channelId = (req.params as { channelId: string }).channelId;
    const result = await twitchConnectionManager.stopChannel(channelId);
    await audit('admin_twitch_stop_channel', authed.session.id, channelId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/restart', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.restartChannel(channelId);
      await audit('admin_twitch_restart_channel', authed.session.id, channelId);
      return result;
    } catch (e: any) {
      return rep.code(400).send({ error: e?.message ?? 'restart_failed' });
    }
  });
};
export default adminRoutes;
