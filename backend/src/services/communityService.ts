import { Platform, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { buildCommunityRadar } from './communityRadarService.js';

export const upsertCommunityUser = async (channelId: string, platform: Platform, externalUserId: string, username: string, displayName?: string) => prisma.communityUser.upsert({
  where: { channelId_platform_externalUserId: { channelId, platform, externalUserId } },
  create: { channelId, platform, externalUserId, username, displayName, firstSeenAt: new Date(), lastSeenAt: new Date(), messageCount: 1 },
  update: { username, displayName, lastSeenAt: new Date(), messageCount: { increment: 1 } }
});

export const incrementCommunityCommandCount = async (channelId: string, platform: Platform, externalUserId: string, username: string) => prisma.communityUser.upsert({
  where: { channelId_platform_externalUserId: { channelId, platform, externalUserId } },
  create: { channelId, platform, externalUserId, username, displayName: username, messageCount: 0, commandCount: 1 },
  update: { username, lastSeenAt: new Date(), commandCount: { increment: 1 } }
});

export const recordChatMessage = async (channelId: string, platform: Platform, externalMessageId: string | null, userExternalId: string, username: string, message: string) => {
  if (externalMessageId) {
    const existing = await prisma.chatMessage.findUnique({ where: { channelId_platform_externalMessageId: { channelId, platform, externalMessageId } } });
    if (existing) return { message: existing, duplicate: true };
    try {
      const created = await prisma.chatMessage.create({ data: { channelId, platform, externalMessageId, userExternalId, username, message } });
      await upsertCommunityUser(channelId, platform, userExternalId, username, username);
      return { message: created, duplicate: false };
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.chatMessage.findUnique({ where: { channelId_platform_externalMessageId: { channelId, platform, externalMessageId } } });
        if (raced) return { message: raced, duplicate: true };
      }
      throw error;
    }
  }

  const created = await prisma.chatMessage.create({ data: { channelId, platform, externalMessageId: null, userExternalId, username, message } });
  await upsertCommunityUser(channelId, platform, userExternalId, username, username);
  return { message: created, duplicate: false };
};

export const getCommunityRadar = async (channelId: string, query: { range?: string }) => buildCommunityRadar(channelId, query.range || '24h');
