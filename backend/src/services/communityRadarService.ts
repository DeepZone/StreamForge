import { prisma } from '../db/prisma.js';

const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

const QUESTION_STARTERS = ['wie','was','wann','warum','wieso','weshalb','wo','wer','kann','gibt es','ist das','hast du','how','what','when','why','where','who','can','is','are','do','does'];
const STOPWORDS = new Set(['aber','alle','alles','also','auch','auf','aus','bei','bin','bis','bist','da','dann','das','dass','dein','deine','dem','den','der','des','dich','die','dir','doch','du','ein','eine','einem','einen','einer','eines','er','es','euch','für','ganz','habe','haben','hat','hatte','hier','ich','ihm','ihn','ihr','im','in','ist','ja','kann','kein','keine','mal','man','mein','meine','mich','mit','nach','nicht','noch','nur','oder','schon','sehr','sein','seine','sich','sie','sind','so','über','um','und','uns','von','vor','war','was','weil','wenn','wer','wie','wir','wird','wo','zu','zum','zur','about','after','all','also','and','are','as','at','be','because','but','by','can','do','does','for','from','get','got','had','has','have','he','her','here','him','his','how','i','if','into','is','it','its','just','like','me','my','no','not','of','on','or','our','she','that','the','their','them','then','there','they','this','to','too','up','was','we','what','when','where','who','why','with','you','your']);

const isUrl = (v: string) => /^https?:\/\//i.test(v) || v.includes('twitch.tv/');
const isNumber = (v: string) => /^\d+$/.test(v);
const isEmoteLike = (v: string) => /^[A-Z][a-zA-Z0-9_]{2,}$/.test(v) || /^[a-zA-Z0-9_]{1,2}$/.test(v);

export const buildActivity = (messages: Array<{ createdAt: Date; userExternalId: string }>, commandsTotal: number) => {
  const users = new Set(messages.map((m) => m.userExternalId));
  const byHour = new Map<string, number>();
  for (const m of messages) {
    const hour = `${m.createdAt.getUTCHours().toString().padStart(2, '0')}:00`;
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
  }
  const perHour = [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, messages: count }));
  const peakHour = perHour.reduce((best, cur) => (cur.messages > best.messages ? cur : best), { hour: '00:00', messages: 0 }).hour;
  return { messagesTotal: messages.length, uniqueUsers: users.size, commandsTotal, peakHour, perHour };
};

const normalizeQuestion = (text: string) => text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.,!?;:()\[\]"']+|[\s.,!?;:()\[\]"']+$/g, '').trim();

export const extractFrequentQuestions = (messages: Array<{ message: string; username: string }>) => {
  const grouped = new Map<string, { count: number; users: Set<string>; examples: string[]; normalized: string }>();
  for (const m of messages) {
    const lower = m.message.toLowerCase().trim();
    const isQuestion = lower.includes('?') || QUESTION_STARTERS.some((q) => lower.startsWith(`${q} `) || lower === q);
    if (!isQuestion) continue;
    const normalized = normalizeQuestion(m.message);
    if (!normalized) continue;
    const words = normalized.split(' ').filter(Boolean);
    const key = words.slice(0, 8).join(' ');
    const entry = grouped.get(key) || { count: 0, users: new Set<string>(), examples: [], normalized };
    entry.count += 1;
    entry.users.add(m.username.toLowerCase());
    if (entry.examples.length < 3 && !entry.examples.includes(m.message)) entry.examples.push(m.message);
    grouped.set(key, entry);
  }
  return [...grouped.entries()]
    .map(([k, v]) => ({ text: v.examples[0] || k, normalized: v.normalized, count: v.count, users: v.users.size, examples: v.examples }))
    .filter((x) => x.count >= 2 || x.users >= 2)
    .sort((a, b) => b.count - a.count || b.users - a.users)
    .slice(0, 15);
};

export const extractTopics = (messages: Array<{ message: string }>, commandPrefix: string) => {
  const counts = new Map<string, number>();
  for (const { message } of messages) {
    if (message.startsWith(commandPrefix)) continue;
    const cleaned = message.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !isNumber(t) && !isUrl(t) && !isEmoteLike(t));
    tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (!a || !b) continue;
      const phrase = `${a} ${b}`;
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([term, count]) => ({ term, count }));
};

export const buildCommandUsage = (messages: Array<{ message: string }>, commandPrefix: string) => {
  const usage = new Map<string, number>();
  for (const m of messages) {
    if (!m.message.startsWith(commandPrefix)) continue;
    const name = m.message.slice(commandPrefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (!name) continue;
    usage.set(name, (usage.get(name) || 0) + 1);
  }
  return [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }));
};

export const buildCommunityRadar = async (channelId: string, range: string) => {
  const safeRange = RANGE_MS[range] ? range : '24h';
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MS[safeRange]);
  const [messages, settings] = await Promise.all([
    prisma.chatMessage.findMany({ where: { channelId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, select: { userExternalId: true, username: true, message: true, createdAt: true } }),
    prisma.channelSettings.findUnique({ where: { channelId }, select: { commandPrefix: true } })
  ]);
  const commandPrefix = settings?.commandPrefix || '!';
  const commandUsage = buildCommandUsage(messages, commandPrefix);
  const userMap = new Map<string, { externalUserId: string; username: string; displayName: string | null; messageCount: number; commandCount: number; firstSeenAt: Date; lastSeenAt: Date }>();
  for (const m of messages) {
    const existing = userMap.get(m.userExternalId) || { externalUserId: m.userExternalId, username: m.username, displayName: m.username, messageCount: 0, commandCount: 0, firstSeenAt: m.createdAt, lastSeenAt: m.createdAt };
    existing.messageCount += 1;
    if (m.message.startsWith(commandPrefix)) existing.commandCount += 1;
    if (m.createdAt < existing.firstSeenAt) existing.firstSeenAt = m.createdAt;
    if (m.createdAt > existing.lastSeenAt) existing.lastSeenAt = m.createdAt;
    userMap.set(m.userExternalId, existing);
  }
  const activeViewers = [...userMap.values()].sort((a, b) => b.messageCount - a.messageCount || b.lastSeenAt.getTime() - a.lastSeenAt.getTime()).slice(0, 20);
  const newActiveUsers = activeViewers.filter((u) => u.firstSeenAt >= from && u.messageCount > 0);
  return {
    range: safeRange,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    activity: buildActivity(messages, commandUsage.reduce((sum, c) => sum + c.count, 0)),
    activeViewers,
    newActiveUsers,
    frequentQuestions: extractFrequentQuestions(messages),
    topics: extractTopics(messages, commandPrefix),
    commands: commandUsage
  };
};
