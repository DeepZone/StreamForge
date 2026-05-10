import { prisma } from '../db/prisma.js';
import { buildCommunityRadar } from './communityRadarService.js';

export const generateRecap = async (channelId: string, body: { range?: string; title?: string }) => {
  const radar = await buildCommunityRadar(channelId, body.range || '24h');
  const stats = radar.activity;
  const topTopics = radar.topics.slice(0, 5);
  const frequentQuestions = radar.frequentQuestions.slice(0, 5);
  const topViewers = radar.activeViewers.slice(0, 5);
  const topCommands = radar.commands.slice(0, 5);

  const summaryText = stats.messagesTotal < 10
    ? 'Für diesen Zeitraum liegen noch nicht genug Chatdaten für einen aussagekräftigen Recap vor.'
    : `Im Zeitraum ${radar.range} wurden ${stats.messagesTotal} Nachrichten von ${stats.uniqueUsers} aktiven Zuschauern geschrieben. Besonders häufig ging es um ${topTopics.map((t) => t.term).join(', ') || 'keine klaren Themen'}. Die aktivste Stunde war ${stats.peakHour} Uhr.`;

  return prisma.streamRecap.create({
    data: {
      channelId,
      summary: summaryText,
      highlightsJson: JSON.stringify({
        title: body.title?.trim() || `Recap ${radar.range}`,
        range: radar.range,
        from: radar.from,
        to: radar.to,
        generatedAt: radar.generatedAt,
        summaryText,
        stats,
        topTopics,
        frequentQuestions,
        topViewers,
        topCommands
      }),
      frequentQuestionsJson: JSON.stringify(frequentQuestions),
      suggestedCommandsJson: JSON.stringify(topCommands),
      returningViewersJson: JSON.stringify(topViewers),
      engagementJson: JSON.stringify(stats),
      recommendationsJson: JSON.stringify([])
    }
  });
};
