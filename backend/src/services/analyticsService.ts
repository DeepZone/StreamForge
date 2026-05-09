import { prisma } from '../db/prisma.js';

type DateRange = { from: Date; to: Date; limit: number };
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const STOPWORDS = new Set(['der','die','das','und','oder','aber','ich','du','er','sie','es','wir','ihr','mit','für','von','auf','in','im','am','an','zu','ist','sind','war','wie','was','wo','wann','warum','auch','mal','den','dem','des','ein','eine','einer','einen','nicht','noch','schon','nur','the','and','or','but','you','they','with','from','on','at','to','are','were','how','also','just']);
const ALLOW_SHORT = new Set(['obs', 'api', 'bot']);

const TOPIC_CLUSTERS = [
  { key: 'Setup & Equipment', words: ['setup','gear','equipment','mikro','mic','kamera','cam','obs','audio'] },
  { key: 'Discord & Community', words: ['discord','server','link','community'] },
  { key: 'Schedule & Livezeiten', words: ['streamplan','schedule','wann','live','nächster'] },
  { key: 'Music', words: ['song','musik','track','gitarre','band'] },
  { key: 'Gaming', words: ['game','spiel','zocken','gaming'] },
  { key: 'Tech & Bot', words: ['api','server','docker','linux','twitch','bot'] }
] as const;
export const resolveRange = (query: { from?: string; to?: string; limit?: string | number }): DateRange => {
  const to = query.to ? new Date(query.to) : new Date(); const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rawLimit = Number(query.limit ?? DEFAULT_LIMIT); const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), MAX_LIMIT); return { from, to, limit };
};
const clean = (t: string) => t.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/@[a-z0-9_]+/g, ' ').replace(/:[a-z0-9_]+:/g, ' ').replace(/\b\d+\b/g, ' ').replace(/[^a-zA-ZäöüÄÖÜß0-9\s]/g, ' ');
export const tokenizeText = (text: string) => clean(text).split(/\s+/).map((x)=>x.trim()).filter((x)=>x && (!STOPWORDS.has(x)) && (x.length >= 4 || ALLOW_SHORT.has(x)));
export const normalizeQuestion = (input: string) => clean(input).replace(/\b(denn|bitte|mal|eigentlich|halt|einfach|so|doch)\b/g, ' ').replace(/\s+/g, ' ').trim();
const deriveCommandName = (q: string) => /mikro|mic/.test(q)?'mic':/kamera|cam/.test(q)?'cam':/discord/.test(q)?'discord':/setup|equipment|gear/.test(q)?'setup':/song|musik/.test(q)?'song':/schedule|streamplan|wann streamst/.test(q)?'schedule':'info';
const groupQuestionKey = (q: string) => tokenizeText(q).slice(0, 8).join(' ');
export const detectFaq = async (channelId:string, range:DateRange)=>{ const messages=await prisma.chatMessage.findMany({where:{channelId,createdAt:{gte:range.from,lte:range.to},message:{contains:'?'}},select:{message:true},take:5000,orderBy:{createdAt:'desc'}}); const grouped=new Map<string,any>(); for (const entry of messages){const n=normalizeQuestion(entry.message); if(!n)continue; const k=groupQuestionKey(n)||n; const c=grouped.get(k)||{count:0,examples:[],question:n}; c.count++; if(c.examples.length<3)c.examples.push(entry.message); grouped.set(k,c);} return [...grouped.values()].map((x)=>({question:x.question,count:x.count,examples:x.examples,suggestedCommandName:deriveCommandName(x.question),suggestedResponseDraft:`TODO: Antwort für !${deriveCommandName(x.question)} ergänzen`})).sort((a,b)=>b.count-a.count).slice(0,20); };

export const detectTopTopics = async (channelId: string, range: DateRange, limit = 8) => {
  const messages = await prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: range.from, lte: range.to } }, select: { message: true }, take: 10000 });
  const clusters = TOPIC_CLUSTERS.map((c) => ({ topic: c.key, score: 0, keywords: new Set<string>(), messageCount: 0 }));
  for (const m of messages) {
    const tokens = tokenizeText(m.message);
    for (const cl of clusters) {
      const words = TOPIC_CLUSTERS.find((x)=>x.key===cl.topic)?.words || [];
      const hits = tokens.filter((t) => (words as readonly string[]).includes(t));
      if (hits.length) { cl.score += hits.length; cl.messageCount += 1; hits.slice(0, 3).forEach((h) => cl.keywords.add(h)); }
    }
  }
  const minHits = messages.length > 200 ? 3 : 2;
  return clusters.filter((c) => c.messageCount >= minHits).sort((a,b)=>b.score-a.score).slice(0, limit).map((c)=>({ topic: c.topic, score: c.score, keywords: [...c.keywords].slice(0,3), messageCount: c.messageCount }));
};

export const calcEngagementScore = (m: { uniqueChatters: number; totalMessages: number; returningViewers: number; questionsDetected: number; commandsUsed: number }) => Math.round(Math.min(30, m.uniqueChatters / 2) + Math.min(25, m.totalMessages / 8) + Math.min(20, m.returningViewers * 2) + Math.min(10, m.questionsDetected) + Math.min(15, m.commandsUsed));
