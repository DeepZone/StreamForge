import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { calcEngagementScore, detectFaq, resolveRange } from './analyticsService.js';

export const upsertCommunityUser = async (channelId: string, platform: Platform, externalUserId: string, username: string, displayName?: string) => prisma.communityUser.upsert({
  where: { channelId_platform_externalUserId: { channelId, platform, externalUserId } },
  create: { channelId, platform, externalUserId, username, displayName, firstSeenAt: new Date(), lastSeenAt: new Date(), messageCount: 1 },
  update: { username, displayName, lastSeenAt: new Date(), messageCount: { increment: 1 } }
});

export const recordChatMessage = async (channelId: string, platform: Platform, externalMessageId: string | null, userExternalId: string, username: string, message: string) => {
  await upsertCommunityUser(channelId, platform, userExternalId, username, username);
  return prisma.chatMessage.create({ data: { channelId, platform, externalMessageId, userExternalId, username, message } });
};

export const getCommunityRadar = async (channelId: string, query: { from?: string; to?: string; limit?: string }) => {
  const range = resolveRange(query);
  const users = await prisma.communityUser.findMany({ where: { channelId, lastSeenAt: { gte: range.from, lte: range.to } }, orderBy: { messageCount: 'desc' }, take: 500 });
  const totalMessages = await prisma.chatMessage.count({ where: { channelId, createdAt: { gte: range.from, lte: range.to } } });
  const activeCommands = await prisma.command.aggregate({ where: { channelId }, _sum: { usageCount: true } });
  const faq = await detectFaq(channelId, range);

  const newViewers = users.filter((u) => u.firstSeenAt >= range.from && u.firstSeenAt <= range.to);
  const returningViewers = users.filter((u) => u.firstSeenAt < range.from);

  const actions = await prisma.moderationAction.groupBy({ by: ['communityUserId'], where: { channelId }, _count: { _all: true } });
  const notes = await prisma.moderationNote.groupBy({ by: ['communityUserId'], where: { channelId }, _count: { _all: true } });
  const actMap = new Map(actions.map((a) => [a.communityUserId, a._count._all]));
  const noteMap = new Map(notes.map((n) => [n.communityUserId, n._count._all]));

  const potentialModerators = returningViewers
    .filter((u) => (actMap.get(u.id) || 0) <= 1 && (u.toxicityScore || 0) < 0.4)
    .map((u) => ({ username: u.username, reason: 'Heuristischer Hinweis: Potenzielle Moderationsunterstützung', score: Math.round((u.messageCount * 0.7 + (u.engagementScore || 0) * 0.3)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, range.limit);

  const watchlist = users
    .filter((u) => (actMap.get(u.id) || 0) > 0 || (noteMap.get(u.id) || 0) > 0)
    .map((u) => ({ username: u.username, reason: 'Auffälligkeit zur manuellen Prüfung', actionCount: actMap.get(u.id) || 0, noteCount: noteMap.get(u.id) || 0 }))
    .slice(0, range.limit);

  const questionsDetected = faq.reduce((acc, x) => acc + x.count, 0);
  const engagementScore = calcEngagementScore({ uniqueChatters: users.length, totalMessages, returningViewers: returningViewers.length, questionsDetected, activeCommands: activeCommands._sum.usageCount || 0 });

  return {
    range,
    summary: { totalMessages, uniqueChatters: users.length, newViewers: newViewers.length, returningViewers: returningViewers.length, activeCommands: activeCommands._sum.usageCount || 0, questionsDetected, engagementScore },
    topChatters: users.slice(0, range.limit).map((u) => ({ username: u.username, displayName: u.displayName, messageCount: u.messageCount, lastSeenAt: u.lastSeenAt })),
    newViewers: newViewers.slice(0, range.limit).map((u) => ({ username: u.username, firstSeenAt: u.firstSeenAt, messageCount: u.messageCount })),
    returningViewers: returningViewers.slice(0, range.limit).map((u) => ({ username: u.username, firstSeenAt: u.firstSeenAt, lastSeenAt: u.lastSeenAt, messageCount: u.messageCount })),
    potentialModerators,
    watchlist
  };
};
