import { prisma } from '../db/prisma.js';
import { BotCore } from '../core/BotCore.js';
import { TwitchApi } from './TwitchApi.js';
import { TwitchChannelSession, TwitchSessionStatus } from './TwitchChannelSession.js';
import { TwitchEventSub } from './TwitchEventSub.js';
import { env } from '../config/env.js';

const RECOVERABLE_STATUSES: TwitchSessionStatus[] = ['connected', 'reconnecting', 'subscribed', 'starting', 'idle'];

export class TwitchConnectionManager {
  private sessions = new Map<string, TwitchChannelSession>();
  private api = new TwitchApi();
  private botCore = new BotCore();
  private eventSubConnected = false;
  private reconcileTimer: NodeJS.Timeout | null = null;

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
    const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true }, select: { id: true } });
    const results = await Promise.allSettled(channels.map((c) => this.startChannel(c.id)));
    const started = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - started;
    this.startReconcileLoop();
    return { ok: true, count: started, failed };
  }

  private startReconcileLoop() {
    if (this.reconcileTimer) return;
    this.reconcileTimer = setInterval(() => { void this.reconcile(); }, 60_000);
  }

  private async reconcile() {
    if (!env.twitchEventSubEnabled) return;
    if (!this.eventSub.isConnected()) this.eventSub.connect();

    const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true }, select: { id: true } });
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
      sessions: Array.from(this.sessions.values()).map((s) => s.getHealth())
    };
  }
}
