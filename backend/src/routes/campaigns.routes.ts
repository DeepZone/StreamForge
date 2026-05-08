import { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const campaignBody = { type: 'object', additionalProperties: false, properties: { shortCode: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,32}$' }, name: { type: 'string', minLength: 1, maxLength: 120 }, sponsorName: { type: 'string', maxLength: 120 }, targetUrl: { type: 'string', format: 'uri', pattern: '^https?://' }, message: { type: 'string', maxLength: 500 }, enabled: { type: 'boolean' } } };

const campaignsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/campaigns', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.campaign.findMany({ where: { channelId: req.params.channelId } }); });
  app.post('/api/channels/:channelId/campaigns', { preHandler: requireAuth, schema: { body: { ...campaignBody, required: ['name', 'targetUrl'] } } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.campaign.create({ data: { channelId: req.params.channelId, shortCode: req.body.shortCode ?? nanoid(8), name: req.body.name, sponsorName: req.body.sponsorName, targetUrl: req.body.targetUrl, message: req.body.message, enabled: req.body.enabled ?? true } }); });
  app.patch('/api/channels/:channelId/campaigns/:id', { preHandler: requireAuth, schema: { body: campaignBody } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.campaign.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); return prisma.campaign.update({ where: { id: req.params.id }, data: { name: req.body.name, sponsorName: req.body.sponsorName, targetUrl: req.body.targetUrl, message: req.body.message, enabled: req.body.enabled ?? true } }); });
  app.delete('/api/channels/:channelId/campaigns/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.campaign.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return rep.code(404).send({ error: 'not_found' }); await prisma.campaign.delete({ where: { id: req.params.id } }); return { ok: true }; });
  app.get('/c/:shortCode', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: any, rep) => { const c = await prisma.campaign.findUnique({ where: { shortCode: req.params.shortCode } }); if (!c) return rep.code(404).send({ errorCode: 'route.not_found', requestId: req.id }); await prisma.campaignClick.create({ data: { campaignId: c.id, platform: 'twitch', ipHash: crypto.createHash('sha256').update(req.ip).digest('hex') } }); return rep.redirect(c.targetUrl); });
};
export default campaignsRoutes;
