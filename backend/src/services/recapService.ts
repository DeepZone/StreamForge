import { prisma } from '../db/prisma.js';
import { detectFaq, detectTopTopics, resolveRange } from './analyticsService.js';
import { getCommunityRadar } from './communityService.js';
import { getCommandSuggestions } from './commandService.js';

export const generateRecap = async (channelId: string, body: { from?: string; to?: string; streamSessionId?: string }) => {
  const range = resolveRange(body);
  const radar = await getCommunityRadar(channelId, body);
  const topics = await detectTopTopics(channelId, range, 8);
  const faq = await detectFaq(channelId, range);
  const suggestions = await getCommandSuggestions(channelId, body);

  const messagesByHourMap = new Map<string, number>();
  const messages = await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to } }, select: { createdAt: true } });
  for (const m of messages) {
    const hour = `${m.createdAt.getUTCHours().toString().padStart(2, '0')}:00`;
    messagesByHourMap.set(hour, (messagesByHourMap.get(hour) || 0) + 1);
  }
  const messagesByHour = [...messagesByHourMap.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour.localeCompare(b.hour));
  const summary = `Im ausgewerteten Zeitraum wurden ${radar.summary.totalMessages} Chatnachrichten von ${radar.summary.uniqueChatters} aktiven Chattern erfasst. Besonders häufig ging es um ${topics.slice(0, 3).map((t) => t.topic).join(', ') || 'keine eindeutigen Themen'}. Es wurden ${radar.summary.questionsDetected} Fragen erkannt. Daraus ergeben sich ${suggestions.filter((s) => !s.alreadyExists).length} sinnvolle Command-Vorschläge.`;

  const recap = await prisma.streamRecap.create({ data: {
    channelId,
    streamSessionId: body.streamSessionId,
    summary,
    highlightsJson: JSON.stringify({ topChatters: radar.topChatters, topTopics: topics, frequentQuestions: faq.slice(0, 5), commandUsage: radar.summary.commandsUsed, notableReturningViewers: radar.returningViewers.slice(0, 5) }),
    frequentQuestionsJson: JSON.stringify(faq),
    suggestedCommandsJson: JSON.stringify(suggestions),
    returningViewersJson: JSON.stringify(radar.returningViewers),
    engagementJson: JSON.stringify({ messagesByHour, totalMessages: radar.summary.totalMessages, uniqueChatters: radar.summary.uniqueChatters, engagementScore: radar.summary.engagementScore }),
    recommendationsJson: JSON.stringify([
      ...suggestions.filter((s) => !s.alreadyExists).slice(0, 3).map((s) => `Erstelle einen !${s.suggestedName} Command, da die Frage "${s.sourceQuestion}" häufiger vorkam.`),
      ...topics.slice(0, 2).map((t) => `Plane erneut Content zum Thema ${t.topic}, da es häufig erwähnt wurde.`),
      'Begrüße wiederkehrende Zuschauer, falls passend.',
      ...radar.watchlist.slice(0, 2).map((w) => `Prüfe Nutzer ${w.username} manuell im Mod Assist, da Moderationshistorie vorhanden ist.`)
    ])
  } });

  return recap;
};
