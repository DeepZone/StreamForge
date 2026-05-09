import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';

const problem=(rep:any,status:number,title:string,detail?:string)=>rep.code(status).send({type:'about:blank',title,status,detail});
const timerBody = { type: 'object', additionalProperties: false, properties: { name: { type: 'string', pattern: '^[a-z0-9_-]{1,32}$' }, message: { type: 'string', minLength: 1, maxLength: 500 }, intervalMinutes: { type: 'integer', minimum: 1, maximum: 1440 }, enabled: { type: 'boolean' } } };
const timersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/timers', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req as AuthedRequest, rep); return prisma.timer.findMany({ where: { channelId: req.params.channelId } }); });
  app.post('/api/channels/:channelId/timers', { preHandler: requireAuth, schema: { body: { ...timerBody, required: ['name', 'message', 'intervalMinutes'] } } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); return prisma.timer.create({ data: { channelId: req.params.channelId, name: req.body.name, message: req.body.message, intervalMinutes: req.body.intervalMinutes, enabled: req.body.enabled ?? true } }); });
  app.patch('/api/channels/:channelId/timers/:id', { preHandler: requireAuth, schema: { body: timerBody } }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_moderator'); const existing = await prisma.timer.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return problem(rep,404,'Not Found'); const data:any={}; if(req.body.name!==undefined)data.name=req.body.name; if(req.body.message!==undefined)data.message=req.body.message; if(req.body.intervalMinutes!==undefined)data.intervalMinutes=req.body.intervalMinutes; if(req.body.enabled!==undefined)data.enabled=!!req.body.enabled; return prisma.timer.update({ where: { id: req.params.id }, data }); });
  app.delete('/api/channels/:channelId/timers/:id', { preHandler: requireAuth }, async (req: any, rep) => { await requireChannelRole(req, rep, 'channel_admin'); const existing = await prisma.timer.findFirst({ where: { id: req.params.id, channelId: req.params.channelId } }); if (!existing) return problem(rep,404,'Not Found'); await prisma.timer.delete({ where: { id: req.params.id } }); return { ok: true }; });
};
export default timersRoutes;
