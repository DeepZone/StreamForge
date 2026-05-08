import { Role } from '@prisma/client';
const rank:Record<Role,number>={viewer:0,channel_moderator:1,channel_admin:2,channel_owner:3,platform_admin:4,system_owner:5};
export const hasRole=(actual:Role,required:Role)=>rank[actual]>=rank[required];
