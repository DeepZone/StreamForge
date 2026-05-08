import { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { isAdmin, requireAuth, AuthedRequest } from '../auth/guards.js';
import { env } from '../config/env.js';
import { twitchConnectionManager } from '../twitch/managerSingleton.js';
import { audit } from '../services/auditService.js';

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/admin/health', { preHandler: requireAuth }, async (req, rep) => {
    if (!isAdmin((req as AuthedRequest).session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    return { ok: true, db: 'up', twitch: { eventSubEnabled: env.twitchEventSubEnabled, ...twitchConnectionManager.health() } };
  });

  const ensureEnabled = (rep: any) => {
    if (!env.twitchEventSubEnabled) {
      rep.code(409).send({ error: 'eventsub_disabled' });
      return false;
    }
    return true;
  };

  app.post('/api/admin/twitch/sessions/start-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const result = await twitchConnectionManager.startAll();
    await audit('admin_twitch_start_all', authed.session.userId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/stop-all', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    const result = await twitchConnectionManager.stopAll();
    await audit('admin_twitch_stop_all', authed.session.userId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/start', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.startChannel(channelId);
      await audit('admin_twitch_start_channel', authed.session.userId, channelId);
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
    await audit('admin_twitch_stop_channel', authed.session.userId, channelId);
    return result;
  });
  app.post('/api/admin/twitch/sessions/:channelId/restart', { preHandler: requireAuth }, async (req, rep) => {
    const authed = req as AuthedRequest;
    if (!isAdmin(authed.session.role as Role)) return rep.code(403).send({ error: 'forbidden' });
    if (!ensureEnabled(rep)) return;
    const channelId = (req.params as { channelId: string }).channelId;
    try {
      const result = await twitchConnectionManager.restartChannel(channelId);
      await audit('admin_twitch_restart_channel', authed.session.userId, channelId);
      return result;
    } catch (e: any) {
      return rep.code(400).send({ error: e?.message ?? 'restart_failed' });
    }
  });
};
export default adminRoutes;
