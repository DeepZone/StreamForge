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

export const normalizeQuestion = (input: string) => input.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\b(denn|bitte|mal|eigentlich|halt|einfach|so|doch)\b/g, ' ').replace(/\s+/g, ' ').trim();

const deriveCommandName = (q: string) => {
  if (/mikro|mic|microphone/.test(q)) return 'mic'; if (/kamera|cam|camera/.test(q)) return 'cam'; if (/discord/.test(q)) return 'discord'; if (/setup|equipment|gear/.test(q)) return 'setup'; if (/song|musik|music/.test(q)) return 'song'; if (/schedule|streamplan|wann streamst/.test(q)) return 'schedule';
  return tokenizeText(q)[0]?.slice(0, 20) || 'info';
};

const groupQuestionKey = (q: string) => tokenizeText(q).slice(0, 8).join(' ');

export const detectFaq = async (channelId: string, range: DateRange) => {
  const messages = await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to }, message: { contains: '?' } }, select: { message: true }, take: 5000, orderBy: { createdAt: 'desc' } });
  const grouped = new Map<string, { count: number; examples: string[]; question: string }>();
  for (const entry of messages) {
    const normalized = normalizeQuestion(entry.message); if (!normalized) continue;
    const key = groupQuestionKey(normalized) || normalized;
    const current = grouped.get(key) || { count: 0, examples: [], question: normalized };
    current.count += 1; if (current.examples.length < 3) current.examples.push(entry.message); grouped.set(key, current);
  }
  return [...grouped.values()].map((x) => ({ question: x.question, count: x.count, examples: x.examples, suggestedCommandName: deriveCommandName(x.question), suggestedResponseDraft: `TODO: Antwort für !${deriveCommandName(x.question)} ergänzen` })).sort((a,b)=>b.count-a.count).slice(0,20);
};

export const tokenizeText = (text: string) => text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/:[a-z0-9_]+:/g, ' ').replace(/[^a-zA-ZäöüÄÖÜß0-9\s]/g, ' ').split(/\s+/).map((x)=>x.trim()).filter((x)=>x.length>2 && !DE_STOPWORDS.has(x) && !EN_STOPWORDS.has(x));

export const extractTopTopics = (messages: string[], limit = 10) => { const counts = new Map<string, number>(); for (const m of messages) { const t = tokenizeText(m); for (const token of t) counts.set(token, (counts.get(token)||0)+1); for (let i=0;i<t.length-1;i++){const bi=`${t[i]} ${t[i+1]}`; counts.set(bi,(counts.get(bi)||0)+1);} } return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([topic,count])=>({topic,count})); };
export const detectTopTopics = async (channelId: string, range: DateRange, limit = 10) => extractTopTopics((await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to } }, select: { message: true }, take: 10000 })).map((m) => m.message), limit);

export const calcEngagementScore = (m: { uniqueChatters: number; totalMessages: number; returningViewers: number; questionsDetected: number; commandsUsed: number }) => {
  // Dieser Score ist ein heuristischer Aktivitätsindikator, keine Qualitäts- oder Personenbewertung.
  return Math.round(Math.min(30, m.uniqueChatters / 2) + Math.min(25, m.totalMessages / 8) + Math.min(20, m.returningViewers * 2) + Math.min(10, m.questionsDetected) + Math.min(15, m.commandsUsed));
};
