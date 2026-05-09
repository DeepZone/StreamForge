import { Platform, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { calcEngagementScore, detectFaq, detectTopTopics, resolveRange } from './analyticsService.js';

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

export const getCommunityRadar = async (channelId: string, query: { from?: string; to?: string; limit?: string }) => {
  const range = resolveRange(query);
  const users = await prisma.communityUser.findMany({ where: { channelId, lastSeenAt: { gte: range.from, lte: range.to } }, orderBy: { messageCount: 'desc' }, take: 500 });
  const [totalMessages, commandUsage, faq, topics, actions, notes, chatMessages] = await Promise.all([
    prisma.chatMessage.count({ where: { channelId, createdAt: { gte: range.from, lte: range.to } } }),
    prisma.command.aggregate({ where: { channelId }, _sum: { usageCount: true } }),
    detectFaq(channelId, range),
    detectTopTopics(channelId, range, 10),
    prisma.moderationAction.groupBy({ by: ['communityUserId'], where: { channelId }, _count: { _all: true } }),
    prisma.moderationNote.groupBy({ by: ['communityUserId'], where: { channelId }, _count: { _all: true } }),
    prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to } }, select: { createdAt: true } })
  ]);

  const newViewers = users.filter((u) => u.firstSeenAt >= range.from && u.firstSeenAt <= range.to);
  const returningViewers = users.filter((u) => u.firstSeenAt < range.from);
  const actMap = new Map(actions.map((a) => [a.communityUserId, a._count._all]));
  const noteMap = new Map(notes.map((n) => [n.communityUserId, n._count._all]));

  const potentialModerators = returningViewers.filter((u) => (actMap.get(u.id) || 0) <= 1 && ((u.toxicityScore ?? 0) < 0.7)).map((u) => ({ username: u.username, messageCount: u.messageCount, reason: 'Hinweis zur manuellen Prüfung: Potenzielle Moderationsunterstützung' })).slice(0, range.limit);
  const watchlist = users.filter((u) => (actMap.get(u.id) || 0) > 0 || (noteMap.get(u.id) || 0) > 0).map((u) => ({ username: u.username, actionCount: actMap.get(u.id) || 0, noteCount: noteMap.get(u.id) || 0, reason: 'Auffälligkeit prüfen (nur manuelle Prüfung)' })).slice(0, range.limit);

  const byHour = new Map<number, number>();
  for (const m of chatMessages) byHour.set(m.createdAt.getHours(), (byHour.get(m.createdAt.getHours()) || 0) + 1);
  const messagesByHour = [...Array(24)].map((_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, count: byHour.get(h) || 0 }));

  const questionsDetected = faq.reduce((acc, x) => acc + x.count, 0);
  const commandsUsed = commandUsage._sum.usageCount || 0;

  const recommendations:string[] = [];
  if (faq.some((x)=>/mikro|mic|setup/i.test(x.question))) recommendations.push('Lege einen !setup oder !mic Command an.');
  if (topics.some((x:any)=>String(x.topic).toLowerCase().includes('discord'))) recommendations.push('Prüfe, ob ein !discord Command sichtbar genug ist.');
  if (newViewers.length >= 10) recommendations.push('Begrüßungs-/Info-Command könnte sinnvoll sein.');
  if (totalMessages < 20) recommendations.push('Stelle gezielte Fragen an den Chat oder nutze einen Timer.');
  if (watchlist.length > 0) recommendations.push('Prüfe Moderationshistorie manuell.');
  return {
    summary: { totalMessages, uniqueChatters: users.length, newViewers: newViewers.length, returningViewers: returningViewers.length, questionsDetected, commandsUsed, engagementScore: calcEngagementScore({ uniqueChatters: users.length, totalMessages, returningViewers: returningViewers.length, questionsDetected, commandsUsed }) },
    topChatters: users.slice(0, range.limit).map((u) => ({ username: u.username, displayName: u.displayName, messageCount: u.messageCount, commandCount: u.commandCount, lastSeenAt: u.lastSeenAt })),
    newViewers: newViewers.slice(0, range.limit).map((u) => ({ username: u.username, firstSeenAt: u.firstSeenAt, messageCount: u.messageCount })),
    returningViewers: returningViewers.slice(0, range.limit).map((u) => ({ username: u.username, lastSeenAt: u.lastSeenAt, messageCount: u.messageCount })),
    topTopics: topics,
    potentialModerators,
    watchlist,
    messagesByHour,
    recommendations: recommendations.slice(0,5)
  };
};
