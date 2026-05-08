import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const safeCommand = (body: any) => ({ name: body.name, aliasesJson: JSON.stringify(body.aliases ?? []), response: body.response, enabled: body.enabled ?? true, cooldownSeconds: body.cooldownSeconds ?? 0, requiredRole: body.requiredRole ?? 'viewer', conditionsJson: JSON.stringify(body.conditions ?? {}) });

const commandsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.command.findMany({ where: { channelId: (req.params as any).channelId }, orderBy: { createdAt: 'desc' } }); });
  app.post('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.command.create({ data: { channelId: req.params.channelId, ...safeCommand(req.body) } }); });
  app.patch('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); return prisma.command.update({ where: { id: req.params.id }, data: safeCommand(req.body) }); });
  app.delete('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); await prisma.command.delete({ where: { id: req.params.id } }); return { ok: true }; });
};
export default commandsRoutes;
