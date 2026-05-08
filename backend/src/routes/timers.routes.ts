import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const timerBody = { type: 'object', additionalProperties: false, properties: { name: { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' }, message: { type: 'string', minLength: 1, maxLength: 500 }, intervalMinutes: { type: 'integer', minimum: 1, maximum: 10080 }, enabled: { type: 'boolean' } } };
const timersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/timers', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.timer.findMany({ where: { channelId: req.params.channelId } }); });
  app.post('/api/channels/:channelId/timers', { preHandler: requireAuth, schema: { body: { ...timerBody, required: ['name', 'message', 'intervalMinutes'] } } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.timer.create({ data: { channelId: req.params.channelId, name: req.body.name, message: req.body.message, intervalMinutes: req.body.intervalMinutes, enabled: req.body.enabled ?? true } }); });
  app.patch('/api/channels/:channelId/timers/:id', { preHandler: requireAuth, schema: { body: timerBody } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.timer.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); return prisma.timer.update({ where: { id: req.params.id }, data: { name: req.body.name, message: req.body.message, intervalMinutes: req.body.intervalMinutes, enabled: req.body.enabled ?? true } }); });
  app.delete('/api/channels/:channelId/timers/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.timer.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); await prisma.timer.delete({ where: { id: req.params.id } }); return { ok: true }; });
};
export default timersRoutes;
