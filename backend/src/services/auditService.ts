import { prisma } from '../db/prisma.js';
export const audit=(action:string,userId?:string,channelId?:string,details:any={})=>prisma.auditLog.create({data:{action,userId,channelId,detailsJson:JSON.stringify(details)}});
