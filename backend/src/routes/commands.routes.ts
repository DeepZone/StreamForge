import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { getCommandSuggestions } from '../services/commandService.js';

const safeCommand = (body: any) => ({ name: body.name, aliasesJson: JSON.stringify(body.aliases ?? []), response: body.response, enabled: body.enabled ?? true, cooldownSeconds: body.cooldownSeconds ?? 0, requiredRole: body.requiredRole ?? 'viewer', conditionsJson: JSON.stringify(body.conditions ?? {}) });

const commandsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.command.findMany({ where: { channelId: (req.params as any).channelId }, orderBy: { createdAt: 'desc' } }); });
  app.get('/api/channels/:channelId/commands/suggestions', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req as AuthedRequest, rep); return getCommandSuggestions(req.params.channelId, req.query); });
  app.post('/api/channels/:channelId/commands/from-suggestion', { preHandler: requireAuth }, async (req: any, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { name, response, aliases = [], sourceQuestion } = req.body || {};
    if (!name || !response) return rep.code(400).send({ error: 'name_and_response_required' });
    const existing = await prisma.command.findMany({ where: { channelId: req.params.channelId } });
    const lowered = String(name).toLowerCase();
    if (existing.some((c) => c.name.toLowerCase() === lowered || JSON.parse(c.aliasesJson || '[]').map((x: string) => x.toLowerCase()).includes(lowered))) return rep.code(409).send({ error: 'command_exists' });
    const created = await prisma.command.create({ data: { channelId: req.params.channelId, name: lowered, response, aliasesJson: JSON.stringify(aliases) } });
    await prisma.auditLog.create({ data: { channelId: req.params.channelId, userId: req.session.userId, action: 'command_created_from_suggestion', detailsJson: JSON.stringify({ sourceQuestion, name: lowered }) } });
    return created;
  });
  app.post('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.command.create({ data: { channelId: req.params.channelId, ...safeCommand(req.body) } }); });
  app.patch('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); return prisma.command.update({ where: { id: req.params.id }, data: safeCommand(req.body) }); });
  app.delete('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); await prisma.command.delete({ where: { id: req.params.id } }); return { ok: true }; });
};
export default commandsRoutes;
