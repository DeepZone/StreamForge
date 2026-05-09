import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { TwitchApi } from '../twitch/TwitchApi.js';
import { resolveChatSendAuth } from '../twitch/chatSenderAuth.js';

const api = new TwitchApi();
const runningTimers = new Set<string>();
let lastRunAt: string | null = null;
let lastError: string | null = null;
let tickHandle: NodeJS.Timeout | null = null;

const logEvent = async (channelId: string, eventType: 'timer_executed' | 'timer_failed', payload: unknown) => {
  await prisma.botEvent.create({ data: { channelId, platform: Platform.twitch, eventType, payloadJson: JSON.stringify(payload ?? {}) } });
};

const runTick = async () => {
  lastRunAt = new Date().toISOString();
  const now = new Date();
  const due = await prisma.timer.findMany({
    where: {
      enabled: true,
      channel: { isActive: true, botEnabled: true, tokens: { isNot: null } },
      OR: [{ lastRunAt: null }, { lastRunAt: { lte: new Date(now.getTime() - 60_000) } }]
    },
    include: { channel: { include: { tokens: true } } }
  });

  for (const timer of due) {
    if (runningTimers.has(timer.id)) continue;
    runningTimers.add(timer.id);
    try {
      if (timer.lastRunAt && now.getTime() - timer.lastRunAt.getTime() < timer.intervalMinutes * 60_000) continue;
      const sendAuth = await resolveChatSendAuth(timer.channelId);
      if (!sendAuth.accessToken) throw new Error(`token_${sendAuth.botTokenStatus}`);
      await api.sendChatMessage({ broadcasterId: sendAuth.broadcasterId, senderId: sendAuth.senderId, accessToken: sendAuth.accessToken, message: timer.message });
      await prisma.timer.update({ where: { id: timer.id }, data: { lastRunAt: now } });
      await logEvent(timer.channelId, 'timer_executed', { timerId: timer.id, timerName: timer.name });
    } catch (e: any) {
      lastError = e?.message ?? 'timer_tick_failed';
      try { await logEvent(timer.channelId, 'timer_failed', { timerId: timer.id, timerName: timer.name, error: lastError }); } catch {}
    } finally {
      runningTimers.delete(timer.id);
    }
  }
};

export const startTimerWorker = () => {
  if (tickHandle) return tickHandle;
  tickHandle = setInterval(() => { void runTick().catch((e) => { lastError = e?.message ?? 'timer_worker_tick_error'; }); }, 30_000);
  return tickHandle;
};

export const getTimerWorkerHealth = () => ({ active: Boolean(tickHandle), inFlightTimers: runningTimers.size, lastRunAt, lastError });
