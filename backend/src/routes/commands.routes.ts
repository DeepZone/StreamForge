import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { getCommandSuggestions } from '../services/commandService.js';

const safeCommand = (body: any) => ({ name: body.name, aliasesJson: JSON.stringify(body.aliases ?? []), response: body.response, enabled: body.enabled ?? true, cooldownSeconds: body.cooldownSeconds ?? 0, requiredRole: body.requiredRole ?? 'viewer', conditionsJson: JSON.stringify({}) });

const commandBody = {
  type: 'object', additionalProperties: false, required: ['name', 'response'], properties: {
    name: { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' }, aliases: { type: 'array', maxItems: 10, items: { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' } },
    response: { type: 'string', minLength: 1, maxLength: 500 }, cooldownSeconds: { type: 'integer', minimum: 0, maximum: 86400 }, enabled: { type: 'boolean' },
    requiredRole: { type: 'string', enum: ['viewer', 'channel_moderator', 'channel_admin', 'channel_owner', 'platform_admin', 'system_owner'] }
  }
};

const commandsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.command.findMany({ where: { channelId: (req.params as any).channelId }, orderBy: { createdAt: 'desc' } }); });
  app.get('/api/channels/:channelId/commands/suggestions', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req as AuthedRequest, rep); return getCommandSuggestions(req.params.channelId, req.query); });
  app.post('/api/channels/:channelId/commands', { preHandler: requireAuth, schema: { body: commandBody } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.command.create({ data: { channelId: req.params.channelId, ...safeCommand(req.body) } }); });
  app.patch('/api/channels/:channelId/commands/:id', { preHandler: requireAuth, schema: { body: { ...commandBody, required: [] } } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); return prisma.command.update({ where: { id: req.params.id }, data: safeCommand(req.body) }); });
  app.delete('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.command.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); await prisma.command.delete({ where: { id: req.params.id } }); return { ok: true }; });
};
export default commandsRoutes;
