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

type TransportState = {
  key: string;
  eventSub: TwitchEventSub;
  channelIds: Set<string>;
};

export class TwitchConnectionManager {
  private sessions = new Map<string, TwitchChannelSession>();
  private sessionTransportKey = new Map<string, string>();
  private transports = new Map<string, TransportState>();
  private api = new TwitchApi();
  private botCore = new BotCore();
  private reconcileTimer: NodeJS.Timeout | null = null;
  private lastStartAllSummary: any = null;

  private getOrCreateTransport(key: string): TransportState {
    const existing = this.transports.get(key);
    if (existing) return existing;
    const transport: TransportState = {
      key,
      channelIds: new Set<string>(),
      eventSub: new TwitchEventSub({
        onWelcome: async (sessionId) => {
          for (const channelId of transport.channelIds.values()) {
            const s = this.sessions.get(channelId);
            if (!s) continue;
            try { await s.ensureSubscription(sessionId); } catch {}
          }
        },
        onNotification: async (payload) => {
          const broadcasterId = payload?.event?.broadcaster_user_id;
          let matched = false;
          for (const channelId of transport.channelIds.values()) {
            const s = this.sessions.get(channelId);
            if (!s) continue;
            if (s.getBroadcasterTwitchId() === broadcasterId) {
              matched = true;
              await s.handleNotification(payload);
            }
          }
          if (!matched) console.warn('eventsub_notification_no_matching_session', { broadcasterId, transportKey: key });
        },
        onReconnect: async () => { for (const channelId of transport.channelIds.values()) this.sessions.get(channelId)?.markReconnect(); },
        onOpen: async () => { for (const channelId of transport.channelIds.values()) this.sessions.get(channelId)?.markConnected(); },
        onClose: async () => undefined
      })
    };
    this.transports.set(key, transport);
    return transport;
  }

  async startAll() {
    if (!env.twitchEventSubEnabled) return { ok: false, reason: 'eventsub_disabled' };
    const platformBot = await prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, select: { twitchLogin: true, twitchUserId: true } });
    const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true, NOT: [{ displayName: 'System' }, { twitchLogin: { startsWith: 'system-' } }, { twitchChannelId: { startsWith: 'sys-' } }] }, select: START_ALL_CHANNEL_SELECT });
    const channelResults: any[] = [];
    for (const channel of channels) {
      const base = { channelId: channel.id, displayName: channel.displayName, twitchLogin: channel.twitchLogin, twitchChannelId: channel.twitchChannelId, hasToken: Boolean(channel.tokens) };
      if (!channel.tokens) { channelResults.push({ ...base, ok: true, status: 'skipped', error: 'missing_twitch_token' }); continue; }
      if (!/^\d+$/u.test(channel.twitchChannelId)) { channelResults.push({ ...base, ok: true, status: 'skipped', error: 'system_channel' }); continue; }
      if (platformBot && (channel.twitchLogin.toLowerCase() === platformBot.twitchLogin.toLowerCase() || channel.twitchChannelId === platformBot.twitchUserId)) { channelResults.push({ ...base, ok: false, status: 'skipped', error: 'platform_bot_channel' }); continue; }
      try { await this.startChannel(channel.id); channelResults.push({ ...base, ok: true, status: 'started', error: null }); } catch (error: any) { channelResults.push({ ...base, ok: false, status: 'failed', error: error?.message ?? 'auth_required' }); }
    }
    for (const transport of this.transports.values()) { if (!transport.eventSub.isConnected()) transport.eventSub.connect(); }
    const started = channelResults.filter((x) => x.status === 'started').length;
    const skipped = channelResults.filter((x) => x.status === 'skipped').length;
    const failed = channelResults.filter((x) => x.status === 'failed').length;
    const transports = Array.from(this.transports.values()).map((t) => ({ key: t.key, channels: Array.from(t.channelIds.values()).map((id) => this.sessions.get(id)?.getHealth().twitchLogin).filter(Boolean), connected: t.eventSub.isConnected() }));
    this.lastStartAllSummary = { started, skipped, failed, reasons: {}, channels: channelResults.map((c) => ({ channelId: c.channelId, status: c.status, error: c.error })), updatedAt: new Date().toISOString() };
    this.startReconcileLoop();
    return { ok: true, count: started, failed, skipped, transports, channels: channelResults };
  }

  private startReconcileLoop() { if (!this.reconcileTimer) this.reconcileTimer = setInterval(() => { void this.reconcile(); }, 60_000); }
  private async reconcile() {
    if (!env.twitchEventSubEnabled) return;
    for (const t of this.transports.values()) if (!t.eventSub.isConnected()) t.eventSub.connect();
    for (const [channelId, s] of this.sessions.entries()) {
      if (!RECOVERABLE_STATUSES.includes(s.status)) continue;
      const key = this.sessionTransportKey.get(channelId);
      if (!key) continue;
      const sessionId = this.transports.get(key)?.eventSub.getSessionId();
      if (sessionId && !s.getHealth().subscribed) { try { await s.ensureSubscription(sessionId); } catch {} }
    }
  }

  async stopAll() { if (this.reconcileTimer) clearInterval(this.reconcileTimer); this.reconcileTimer = null; await Promise.all(Array.from(this.sessions.values()).map((s) => s.stop('stop_all'))); this.sessions.clear(); this.sessionTransportKey.clear(); this.transports.forEach((t) => t.eventSub.stop()); this.transports.clear(); return { ok: true }; }
  async restartEventSub() { this.transports.forEach((t) => { t.eventSub.stop(); t.channelIds.forEach((id) => this.sessions.get(id)?.markReconnect()); t.eventSub.connect(); }); return { ok: true }; }
  async cleanupSubscriptions(channelId?: string) {
    const targets = channelId ? [this.sessions.get(channelId)].filter(Boolean) as TwitchChannelSession[] : Array.from(this.sessions.values());
    const cleaned: any[] = [];
    for (const session of targets) cleaned.push(await session.cleanupEventSubSubscriptions());
    return { ok: true, cleaned };
  }

  async startChannel(channelId: string) {
    const existing = this.sessions.get(channelId);
    if (existing) return existing.getHealth();
    const s = new TwitchChannelSession(channelId, this.api, this.botCore);
    await s.init();
    this.sessions.set(channelId, s);
    const key = s.getBroadcasterTwitchId();
    const transport = this.getOrCreateTransport(key);
    transport.channelIds.add(channelId);
    this.sessionTransportKey.set(channelId, key);
    if (transport.eventSub.getSessionId()) { try { await s.ensureSubscription(transport.eventSub.getSessionId()!); } catch (e: any) { if (String(e?.message ?? '').includes('different users')) { s.lastError = 'eventsub_user_context_mismatch'; console.error('eventsub_user_context_mismatch', { channelId, transportKey: key }); } } }
    if (!transport.eventSub.isConnected()) transport.eventSub.connect();
    return s.getHealth();
  }

  async stopChannel(channelId: string) { const current = this.sessions.get(channelId); if (!current) return { ok: false, reason: 'session_not_found' }; await current.stop('manual_stop'); this.sessions.delete(channelId); const key = this.sessionTransportKey.get(channelId); this.sessionTransportKey.delete(channelId); if (key) { const t = this.transports.get(key); t?.channelIds.delete(channelId); if (t && t.channelIds.size === 0) { t.eventSub.stop(); this.transports.delete(key); } } return { ok: true }; }
  async restartChannel(channelId: string) { await this.stopChannel(channelId); return this.startChannel(channelId); }

  health() {
    const transports = Array.from(this.transports.values()).map((t) => ({ key: t.key, connected: t.eventSub.isConnected(), sessionIdPresent: Boolean(t.eventSub.getSessionId()), lastWelcomeAt: t.eventSub.lastWelcomeAt, lastError: t.eventSub.lastError, channels: Array.from(t.channelIds.values()).map((id) => this.sessions.get(id)?.getHealth().twitchLogin).filter(Boolean) }));
    const sessions = Array.from(this.sessions.values()).map((s) => ({ ...s.getHealth(), transportKey: this.sessionTransportKey.get(s.channelId) ?? null }));
    return { eventSubEnabled: env.twitchEventSubEnabled, activeSessions: this.sessions.size, sessionsCount: this.sessions.size, transports, sessions, startAll: this.lastStartAllSummary };
  }
}
