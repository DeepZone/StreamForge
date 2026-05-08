import { Role } from '@prisma/client';
import { parseCommand, findCommand, executeCustomCommand, incrementUsage, checkCooldown } from '../services/commandService.js';
import { prisma } from '../db/prisma.js';
import { TenantContext } from './TenantContext.js';
import { BotMessage, BotResponse } from './types.js';

const roleRank: Record<Role, number> = {
  viewer: 0,
  channel_moderator: 1,
  channel_admin: 2,
  channel_owner: 3,
  platform_admin: 4,
  system_owner: 5
};

export class BotCore {
  async handleMessage(message: BotMessage, tenant: TenantContext): Promise<BotResponse | null> {
    const settings = await prisma.channelSettings.findUnique({ where: { channelId: tenant.channelId } });
    const parsed = parseCommand(message.content, settings?.commandPrefix ?? '!');
    if (!parsed) return null;
    const command = await findCommand(tenant.channelId, parsed.name);
    if (!command || !command.enabled) return null;

    const callerRole: Role = message.isBroadcaster ? 'channel_owner' : message.isMod ? 'channel_moderator' : 'viewer';
    if (roleRank[callerRole] < roleRank[command.requiredRole]) return null;
    if (!checkCooldown(tenant.channelId, command.id, message.userId, command.cooldownSeconds)) return null;

    const response = await executeCustomCommand(tenant.channelId, command, message);
    await incrementUsage(command.id);
    return { content: response };
  }
}
