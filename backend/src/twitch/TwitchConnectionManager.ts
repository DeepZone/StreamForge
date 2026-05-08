import { prisma } from '../db/prisma.js';
import { BotCore } from '../core/BotCore.js';
import { TwitchApi } from './TwitchApi.js';
import { TwitchChannelSession } from './TwitchChannelSession.js';
import { TwitchEventSub } from './TwitchEventSub.js';

export class TwitchConnectionManager {
  private sessions = new Map<string, TwitchChannelSession>();
  private api = new TwitchApi();
  private botCore = new BotCore();
  private eventSub = new TwitchEventSub({
    onWelcome: async (sessionId) => { for (const s of this.sessions.values()) { try { await s.ensureSubscription(sessionId); } catch (e) { console.error('[twitch-manager] subscribe failed', e); } } },
    onNotification: async (payload) => { const broadcasterId = payload?.event?.broadcaster_user_id; for (const s of this.sessions.values()) { if (s.getBroadcasterTwitchId() === broadcasterId) await s.handleNotification(payload); } }
  });
  async startAll() { const channels = await prisma.channel.findMany({ where: { isActive: true, botEnabled: true }, select: { id: true } }); await Promise.all(channels.map((c) => this.startChannel(c.id))); this.eventSub.connect(); }
  async startChannel(channelId: string) { const s = new TwitchChannelSession(channelId, this.api, this.botCore); await s.init(); this.sessions.set(channelId, s); }
  stopChannel(channelId: string) { this.sessions.delete(channelId); }
  async restartChannel(channelId: string) { this.stopChannel(channelId); await this.startChannel(channelId); }
  health() { return { activeSessions: this.sessions.size, channels: Array.from(this.sessions.entries()).map(([channelId, s]) => ({ channelId, status: s.status, lastError: s.lastError, connected: s.status === 'subscribed' })) }; }
}
