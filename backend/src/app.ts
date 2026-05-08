import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { Campaign, Command, Role, Timer } from '@prisma/client';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { prisma } from './db/prisma.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import { getSession, setSession, SessionUser } from './auth/session.js';

const app = Fastify();
app.register(cookie);
app.register(cors, { origin: true, credentials: true });

type AutoReq = FastifyRequest & { session: SessionUser };
const roleRank: Record<Role, number> = { viewer: 0, channel_moderator: 1, channel_admin: 2, channel_owner: 3, platform_admin: 4, system_owner: 5 };
const isAdmin = (r: Role) => r === 'system_owner' || r === 'platform_admin';

const requireAuth = async (req: FastifyRequest, rep: FastifyReply) => {
  const s = getSession(req);
  if (!s) return rep.code(401).send({ error: 'unauthorized' });
  (req as AutoReq).session = s;
};
const requireChannel = async (req: AutoReq, rep: FastifyReply, required: Role = 'viewer') => {
  if (isAdmin(req.session.role as Role)) return;
  const channelRole = req.session.channelRoles[String((req.params as { channelId: string }).channelId)] as Role | undefined;
  if (!channelRole || roleRank[channelRole] < roleRank[required]) return rep.code(403).send({ error: 'forbidden' });
};

app.get('/api/setup/status', async () => ({ setupAllowed: !(await prisma.user.findFirst({ where: { isLocalAdmin: true, members: { some: { role: 'system_owner' } } } })) }));
app.post('/api/setup/create-owner', async (req: FastifyRequest<{ Body: { email: string; password: string; displayName: string } }>, rep) => {
  const exists = await prisma.user.findFirst({ where: { isLocalAdmin: true, members: { some: { role: 'system_owner' } } } });
  if (exists) return rep.code(403).send({ error: 'setup disabled' });
  const user = await prisma.user.create({ data: { email: req.body.email.toLowerCase(), passwordHash: await hashPassword(req.body.password), displayName: req.body.displayName, isLocalAdmin: true } });
  const c = await prisma.channel.create({ data: { twitchChannelId: `sys-${user.id}`, twitchLogin: `system-${user.id.slice(-6)}`, displayName: 'System' } });
  await prisma.channelMember.create({ data: { channelId: c.id, userId: user.id, role: 'system_owner' } });
  setSession(rep, { id: user.id, role: 'system_owner', channelRoles: { [c.id]: 'system_owner' } });
  return { ok: true };
});
app.post('/api/auth/login', async (req: FastifyRequest<{ Body: { email: string; password: string } }>, rep) => {
  const u = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
  if (!u) return rep.code(401).send({ error: 'user_not_found' });
  if (!u.passwordHash || !(await verifyPassword(u.passwordHash, req.body.password))) return rep.code(401).send({ error: 'invalid_password' });
  const m = await prisma.channelMember.findMany({ where: { userId: u.id } });
  const cr = Object.fromEntries(m.map((x) => [x.channelId, x.role]));
  const role = (m.find((x) => x.role === 'system_owner')?.role ?? m.find((x) => x.role === 'platform_admin')?.role ?? 'viewer') as Role;
  setSession(rep, { id: u.id, role, channelRoles: cr });
  return { ok: true };
});
app.post('/api/auth/logout', async (_req, rep) => { rep.clearCookie('sf_session', { path: '/' }); return { ok: true }; });
app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => ({ session: (req as AutoReq).session }));

app.get('/api/channels', { preHandler: requireAuth }, async (req) => prisma.channel.findMany({ where: isAdmin((req as AutoReq).session.role as Role) ? {} : { id: { in: Object.keys((req as AutoReq).session.channelRoles) } } }));
app.get('/api/channels/:channelId', { preHandler: requireAuth }, async (req, rep) => { await requireChannel(req as AutoReq, rep); return prisma.channel.findUnique({ where: { id: (req.params as { channelId: string }).channelId } }); });

const safeCommand = (body: any) => ({ name: body.name, aliasesJson: JSON.stringify(body.aliases ?? []), response: body.response, enabled: body.enabled ?? true, cooldownSeconds: body.cooldownSeconds ?? 0, requiredRole: body.requiredRole ?? 'viewer', conditionsJson: JSON.stringify(body.conditions ?? {}) });
app.get('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req, rep) => { await requireChannel(req as AutoReq, rep); return prisma.command.findMany({ where: { channelId: (req.params as any).channelId }, orderBy: { createdAt: 'desc' } }); });
app.post('/api/channels/:channelId/commands', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); return prisma.command.create({ data: { channelId: req.params.channelId, ...safeCommand(req.body) } }); });
app.patch('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); const { usageCount, ...rest } = req.body; const existing=await prisma.command.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); return prisma.command.update({ where: { id: req.params.id }, data: safeCommand(rest) }); });
app.delete('/api/channels/:channelId/commands/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_admin'); const existing=await prisma.command.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); await prisma.command.delete({ where: { id: req.params.id } }); return { ok: true }; });

app.get('/api/channels/:channelId/timers', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep); return prisma.timer.findMany({ where: { channelId: req.params.channelId } }); });
app.post('/api/channels/:channelId/timers', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); return prisma.timer.create({ data: { channelId: req.params.channelId, name: req.body.name, message: req.body.message, intervalMinutes: Math.max(1, Number(req.body.intervalMinutes || 1)), enabled: req.body.enabled ?? true } }); });
app.patch('/api/channels/:channelId/timers/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); const existing=await prisma.timer.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); return prisma.timer.update({ where: { id: req.params.id }, data: { name: req.body.name, message: req.body.message, intervalMinutes: Math.max(1, Number(req.body.intervalMinutes || 1)), enabled: req.body.enabled ?? true } }); });
app.delete('/api/channels/:channelId/timers/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_admin'); const existing=await prisma.timer.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); await prisma.timer.delete({ where: { id: req.params.id } }); return { ok: true }; });

app.get('/api/channels/:channelId/campaigns', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep); return prisma.campaign.findMany({ where: { channelId: req.params.channelId } }); });
app.post('/api/channels/:channelId/campaigns', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); const shortCode = req.body.shortCode ?? nanoid(8); return prisma.campaign.create({ data: { channelId: req.params.channelId, shortCode, name: req.body.name, sponsorName: req.body.sponsorName, targetUrl: req.body.targetUrl, message: req.body.message, enabled: req.body.enabled ?? true } }); });
app.patch('/api/channels/:channelId/campaigns/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_moderator'); const existing=await prisma.campaign.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); return prisma.campaign.update({ where: { id: req.params.id }, data: { name: req.body.name, sponsorName: req.body.sponsorName, targetUrl: req.body.targetUrl, message: req.body.message, enabled: req.body.enabled ?? true } }); });
app.delete('/api/channels/:channelId/campaigns/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannel(req, rep, 'channel_admin'); const existing=await prisma.campaign.findFirst({where:{id:req.params.id,channelId:req.params.channelId}}); if(!existing) return rep.code(404).send({error:'not_found'}); await prisma.campaign.delete({ where: { id: req.params.id } }); return { ok: true }; });

app.get('/c/:shortCode', async (req: any, rep) => { const c = await prisma.campaign.findUnique({ where: { shortCode: req.params.shortCode } }); if (!c) return rep.code(404).send('not found'); await prisma.campaignClick.create({ data: { campaignId: c.id, platform: 'twitch', ipHash: crypto.createHash('sha256').update(req.ip).digest('hex') } }); return rep.redirect(c.targetUrl); });
app.get('/api/admin/health', { preHandler: requireAuth }, async (req: any, rep) => { if (!isAdmin(req.session.role)) return rep.code(403).send({ error: 'forbidden' }); return { ok: true, db: 'up' }; });

export default app;
