import { prisma } from '../db/prisma.js';

type DateRange = { from: Date; to: Date; limit: number };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const DE_STOPWORDS = new Set(['der','die','das','und','oder','aber','ich','du','er','sie','es','wir','ihr','mit','für','von','auf','in','im','am','an','zu','ist','sind','war','wie','was','wo','wann','warum','auch','mal','den','dem','des','ein','eine','einer','einen','nicht','noch','schon','nur']);
const EN_STOPWORDS = new Set(['the','and','or','but','i','you','he','she','it','we','they','with','for','from','on','in','at','to','is','are','was','were','how','what','where','when','why','also','just','not']);

export const resolveRange = (query: { from?: string; to?: string; limit?: string | number }): DateRange => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rawLimit = Number(query.limit ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { from, to, limit };
};

export const normalizeQuestion = (input: string) => input
  .toLowerCase()
  .replace(/[!?.,:;"'`()\[\]{}]/g, ' ')
  .replace(/\b(denn|bitte|mal|eigentlich|halt|einfach|so|doch)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const deriveCommandName = (question: string) => {
  const q = question.toLowerCase();
  if (/mikro|micro|mic/.test(q)) return 'mic';
  if (/discord/.test(q)) return 'discord';
  if (/kamera|cam|camera/.test(q)) return 'cam';
  const token = tokenizeText(q).find((t) => t.length > 2) || 'info';
  return token.slice(0, 20);
};

export const detectFaq = async (channelId: string, range: DateRange) => {
  const messages = await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to }, message: { contains: '?' } }, select: { message: true }, take: 5000, orderBy: { createdAt: 'desc' } });
  const grouped = new Map<string, { count: number; examples: string[] }>();
  for (const entry of messages) {
    const normalized = normalizeQuestion(entry.message);
    if (!normalized) continue;
    const current = grouped.get(normalized) || { count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 3) current.examples.push(entry.message);
    grouped.set(normalized, current);
  }

  return [...grouped.entries()]
    .map(([question, data]) => ({
      question,
      count: data.count,
      examples: data.examples,
      suggestedCommandName: deriveCommandName(question),
      suggestedResponseDraft: `Kurzantwort für Chat zu: ${question}`
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
};

export const tokenizeText = (text: string) => text
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[^a-zA-ZäöüÄÖÜß0-9\s]/g, ' ')
  .split(/\s+/)
  .map((x) => x.trim())
  .filter((x) => x.length > 2 && !DE_STOPWORDS.has(x) && !EN_STOPWORDS.has(x));

export const detectTopTopics = async (channelId: string, range: DateRange, limit = 10) => {
  const messages = await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to } }, select: { message: true }, take: 10000 });
  const counts = new Map<string, number>();
  for (const { message } of messages) {
    for (const token of tokenizeText(message)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([topic, count]) => ({ topic, count }));
};

export const calcEngagementScore = (metrics: { uniqueChatters: number; totalMessages: number; returningViewers: number; questionsDetected: number; activeCommands: number }) => {
  // transparent indicator formula with capped weighted components (0-100)
  const score = Math.min(100,
    Math.min(metrics.uniqueChatters, 50) * 0.6 +
    Math.min(metrics.totalMessages / 10, 30) * 0.7 +
    Math.min(metrics.returningViewers, 30) * 0.8 +
    Math.min(metrics.questionsDetected, 20) * 0.5 +
    Math.min(metrics.activeCommands, 20) * 0.6
  );
  return Math.round(score);
};
