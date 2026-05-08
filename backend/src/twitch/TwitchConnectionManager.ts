import { prisma } from '../db/prisma.js';
import { BotCore } from '../core/BotCore.js';
import { TwitchApi } from './TwitchApi.js';
import { TwitchChannelSession } from './TwitchChannelSession.js';
import { TwitchEventSub } from './TwitchEventSub.js';
import { env } from '../config/env.js';

export class TwitchConnectionManager {
  private sessions = new Map<string, TwitchChannelSession>();
  private api = new TwitchApi();
  private botCore = new BotCore();
  private eventSubConnected = false;

  private eventSub = new TwitchEventSub({
    onWelcome: async (sessionId) => { for (const s of this.sessions.values()) { try { await s.ensureSubscription(sessionId); } catch {} } },
    onNotification: async (payload) => { const broadcasterId = payload?.event?.broadcaster_user_id; for (const s of this.sessions.values()) { if (s.getBroadcasterTwitchId() === broadcasterId) await s.handleNotification(payload); } },
    onReconnect: async () => { this.eventSubConnected = false; this.sessions.forEach((s) => s.markReconnect()); },
    onOpen: async () => { this.eventSubConnected = true; this.sessions.forEach((s) => s.markConnected()); }
  });

  async startAll() {
    if (!env.twitchEventSubEnabled) return { ok: false, reason: 'eventsub_disabled' };
    const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true }, select: { id: true } });
    const results = await Promise.allSettled(channels.map((c) => this.startChannel(c.id)));
    const started = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - started;
    this.eventSub.connect();
    return { ok: true, count: started, failed };
  }

  async stopAll() {
    await Promise.all(Array.from(this.sessions.values()).map((s) => s.stop('stop_all')));
    this.sessions.clear();
    this.eventSub.stop();
    this.eventSubConnected = false;
    return { ok: true };
  }

  async startChannel(channelId: string) {
    const s = new TwitchChannelSession(channelId, this.api, this.botCore);
    await s.init();
    this.sessions.set(channelId, s);
    return s.getHealth();
  }

  async stopChannel(channelId: string) {
    const current = this.sessions.get(channelId);
    if (!current) return { ok: false, reason: 'session_not_found' };
    await current.stop('manual_stop');
    this.sessions.delete(channelId);
    return { ok: true };
  }

  async restartChannel(channelId: string) {
    await this.stopChannel(channelId);
    return this.startChannel(channelId);
  }

  health() {
    return { eventSubConnected: this.eventSubConnected, activeSessions: this.sessions.size, sessionsCount: this.sessions.size, sessions: Array.from(this.sessions.values()).map((s) => s.getHealth()) };
  }
}
