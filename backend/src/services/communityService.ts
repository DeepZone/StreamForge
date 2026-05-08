import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export const upsertCommunityUser = async (
  channelId: string,
  platform: Platform,
  externalUserId: string,
  username: string,
  displayName?: string
) => {
  return prisma.communityUser.upsert({
    where: { channelId_platform_externalUserId: { channelId, platform, externalUserId } },
    create: { channelId, platform, externalUserId, username, displayName, firstSeenAt: new Date(), lastSeenAt: new Date(), messageCount: 1 },
    update: { username, displayName, lastSeenAt: new Date(), messageCount: { increment: 1 } }
  });
};

export const recordChatMessage = async (
  channelId: string,
  platform: Platform,
  externalMessageId: string | null,
  userExternalId: string,
  username: string,
  message: string
) => {
  await upsertCommunityUser(channelId, platform, userExternalId, username, username);
  return prisma.chatMessage.create({ data: { channelId, platform, externalMessageId, userExternalId, username, message } });
};
