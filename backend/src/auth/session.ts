import { FastifyReply, FastifyRequest } from 'fastify';
export type SessionUser={id:string; role:string; channelRoles: Record<string,string>};
export const setSession=(r:FastifyReply,u:SessionUser)=>r.setCookie('sf_session',Buffer.from(JSON.stringify(u)).toString('base64'),{path:'/',httpOnly:true,sameSite:'lax'});
export const getSession=(req:FastifyRequest):SessionUser|null=>{try{return JSON.parse(Buffer.from((req.cookies as any).sf_session||'','base64').toString());}catch{return null;}};
