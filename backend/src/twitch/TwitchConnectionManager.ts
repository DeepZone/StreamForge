import { prisma } from '../db/prisma.js';
import { BotCore } from '../core/BotCore.js';
import { TwitchApi } from './TwitchApi.js';
import { TwitchChannelSession, TwitchSessionStatus } from './TwitchChannelSession.js';
import { TwitchEventSub } from './TwitchEventSub.js';
import { env } from '../config/env.js';

const RECOVERABLE_STATUSES: TwitchSessionStatus[] = ['connected', 'reconnecting', 'subscribed', 'starting', 'idle'];

const START_ALL_CHANNEL_SELECT = {
  id: true,
  displayName: true,
  twitchLogin: true,
  twitchChannelId: true,
  tokens: { select: { id: true } }
} as const;

export class TwitchConnectionManager {
  private sessions = new Map<string, TwitchChannelSession>();
  private api = new TwitchApi();
  private botCore = new BotCore();
  private eventSubConnected = false;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private lastStartAllSummary: {
    started: number;
    skipped: number;
    failed: number;
    reasons: Record<string, number>;
    channels: Array<{ channelId: string; status: 'started' | 'skipped' | 'failed'; error: string | null }>;
    updatedAt: string;
  } | null = null;

  private eventSub = new TwitchEventSub({
    onWelcome: async (sessionId) => {
      for (const s of this.sessions.values()) {
        try { await s.ensureSubscription(sessionId); } catch {}
      }
    },
    onNotification: async (payload) => {
      const broadcasterId = payload?.event?.broadcaster_user_id;
      for (const s of this.sessions.values()) {
        if (s.getBroadcasterTwitchId() === broadcasterId) await s.handleNotification(payload);
      }
    },
    onReconnect: async () => { this.eventSubConnected = false; this.sessions.forEach((s) => s.markReconnect()); },
    onOpen: async () => { this.eventSubConnected = true; this.sessions.forEach((s) => s.markConnected()); },
    onClose: async () => { this.eventSubConnected = false; }
  });

  async startAll() {
    if (!env.twitchEventSubEnabled) return { ok: false, reason: 'eventsub_disabled' };
    this.eventSub.connect();

    const channels = await prisma.channel.findMany({
      where: {
        isActive: true,
        botEnabled: true,
        NOT: [
          { displayName: 'System' },
          { twitchLogin: { startsWith: 'system-' } },
          { twitchChannelId: { startsWith: 'sys-' } }
        ]
      },
      select: START_ALL_CHANNEL_SELECT
    });

    const channelResults: Array<{
      channelId: string;
      displayName: string;
      twitchLogin: string;
      twitchChannelId: string;
      hasToken: boolean;
      ok: boolean;
      status: 'started' | 'skipped' | 'failed';
      error: string | null;
    }> = [];

    for (const channel of channels) {
      const base = {
        channelId: channel.id,
        displayName: channel.displayName,
        twitchLogin: channel.twitchLogin,
        twitchChannelId: channel.twitchChannelId,
        hasToken: Boolean(channel.tokens)
      };

      if (!channel.tokens) {
        channelResults.push({ ...base, ok: true, status: 'skipped', error: 'missing_twitch_token' });
        continue;
      }

      if (!/^\d+$/u.test(channel.twitchChannelId)) {
        channelResults.push({ ...base, ok: true, status: 'skipped', error: 'system_channel' });
        continue;
      }

      try {
        await this.startChannel(channel.id);
        channelResults.push({ ...base, ok: true, status: 'started', error: null });
      } catch (error: any) {
        channelResults.push({ ...base, ok: false, status: 'failed', error: error?.message ?? 'auth_required' });
      }
    }

    const started = channelResults.filter((x) => x.status === 'started').length;
    const skipped = channelResults.filter((x) => x.status === 'skipped').length;
    const failed = channelResults.filter((x) => x.status === 'failed').length;
    const reasons = channelResults.reduce<Record<string, number>>((acc, item) => {
      if (!item.error) return acc;
      acc[item.error] = (acc[item.error] ?? 0) + 1;
      return acc;
    }, {});
    this.lastStartAllSummary = {
      started,
      skipped,
      failed,
      reasons,
      channels: channelResults.map((c) => ({ channelId: c.channelId, status: c.status, error: c.error })),
      updatedAt: new Date().toISOString()
    };

    this.startReconcileLoop();
    return { ok: true, count: started, failed, skipped, channels: channelResults };
  }

  private startReconcileLoop() {
    if (this.reconcileTimer) return;
    this.reconcileTimer = setInterval(() => { void this.reconcile(); }, 60_000);
  }

  private async reconcile() {
    if (!env.twitchEventSubEnabled) return;
    if (!this.eventSub.isConnected()) this.eventSub.connect();

    const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true, tokens: { isNot: null }, NOT: [{ displayName: 'System' }, { twitchLogin: { startsWith: 'system-' } }, { twitchChannelId: { startsWith: 'sys-' } }] }, select: { id: true } });
    const activeIds = new Set(channels.map((c) => c.id));
    for (const c of channels) {
      if (!this.sessions.has(c.id)) {
        try { await this.startChannel(c.id); } catch {}
      }
    }

    const sessionId = this.eventSub.getSessionId();
    if (!sessionId) return;

    for (const [channelId, s] of this.sessions.entries()) {
      if (!activeIds.has(channelId)) continue;
      if (!RECOVERABLE_STATUSES.includes(s.status)) continue;
      if (!s.getHealth().subscribed) {
        try { await s.ensureSubscription(sessionId); } catch {}
      }
    }
  }

  async stopAll() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    await Promise.all(Array.from(this.sessions.values()).map((s) => s.stop('stop_all')));
    this.sessions.clear();
    this.eventSub.stop();
    this.eventSubConnected = false;
    return { ok: true };
  }

  async restartEventSub() {
    this.eventSub.stop();
    this.eventSubConnected = false;
    this.sessions.forEach((s) => s.markReconnect());
    this.eventSub.connect();
    return { ok: true };
  }

  async startChannel(channelId: string) {
    const existing = this.sessions.get(channelId);
    if (existing) return existing.getHealth();
    const s = new TwitchChannelSession(channelId, this.api, this.botCore);
    await s.init();
    this.sessions.set(channelId, s);
    const sessionId = this.eventSub.getSessionId();
    if (sessionId) {
      try { await s.ensureSubscription(sessionId); } catch {}
    }
    return s.getHealth();
  }

  async stopChannel(channelId: string) {
    const current = this.sessions.get(channelId);
    if (!current) return { ok: false, reason: 'session_not_found' };
    await current.stop('manual_stop');
    this.sessions.delete(channelId);
    return { ok: true };
  }

  async restartChannel(channelId: string) { await this.stopChannel(channelId); return this.startChannel(channelId); }

  health() {
    return {
      eventSubEnabled: env.twitchEventSubEnabled,
      eventSubConnected: this.eventSubConnected,
      eventSubSessionIdPresent: Boolean(this.eventSub.getSessionId()),
      eventSubSessionId: this.eventSub.getSessionId(),
      eventSubLastWelcomeAt: this.eventSub.lastWelcomeAt,
      eventSubLastReconnectAt: this.eventSub.lastReconnectAt,
      eventSubLastConnectedAt: this.eventSub.lastConnectedAt,
      eventSubLastError: this.eventSub.lastError,
      activeSessions: this.sessions.size,
      sessionsCount: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map((s) => s.getHealth()),
      startAll: this.lastStartAllSummary
    };
  }
}
