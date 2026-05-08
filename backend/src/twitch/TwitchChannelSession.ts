import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { BotCore } from '../core/BotCore.js';
import { TenantContext } from '../core/TenantContext.js';
import { TwitchApi } from './TwitchApi.js';
import { recordChatMessage } from '../services/communityService.js';

export type TwitchSessionStatus = 'idle' | 'starting' | 'connected' | 'subscribed' | 'reconnecting' | 'stopped' | 'token_error' | 'error' | 'auth_required';

export class TwitchChannelSession {
  public status: TwitchSessionStatus = 'idle';
  public lastError: string | null = null;
  public lastConnectedAt: string | null = null;
  public lastMessageAt: string | null = null;
  public lastSubscriptionAt: string | null = null;
  public reconnectCount = 0;
  public subscriptionsCount = 0;

  private channelTwitchId = '';
  private twitchLogin = '';
  private accessToken = '';
  private ownerTwitchId = '';

  constructor(public channelId: string, private api: TwitchApi, private botCore: BotCore) {}

  private async logEvent(eventType: string, payload: Record<string, unknown> = {}) {
    await prisma.botEvent.create({ data: { channelId: this.channelId, platform: Platform.twitch, eventType, payloadJson: JSON.stringify(payload) } });
  }

  private async validateAndLoadToken() {
    const token = await prisma.twitchToken.findUnique({ where: { channelId: this.channelId } });
    if (!token?.accessTokenEncrypted || !token.refreshTokenEncrypted) throw new Error('auth_required');

    let refreshToken = '';
    try {
      this.accessToken = decryptSecret(token.accessTokenEncrypted);
      refreshToken = decryptSecret(token.refreshTokenEncrypted);
    } catch {
      throw new Error('token_decrypt_failed');
    }

    const needsRefresh = token.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000;
    if (!needsRefresh) return;

    try {
      const refreshed = await this.api.refreshAccessToken(refreshToken);
      this.accessToken = refreshed.access_token;
      await prisma.twitchToken.update({
        where: { channelId: this.channelId },
        data: {
          accessTokenEncrypted: encryptSecret(refreshed.access_token),
          refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken),
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scopesJson: JSON.stringify(refreshed.scope ?? [])
        }
      });
      await this.logEvent('token_refresh_success', { expiresIn: refreshed.expires_in });
    } catch (e: any) {
      this.status = 'token_error';
      this.lastError = e?.message ?? 'token_refresh_failed';
      await this.logEvent('token_refresh_failed', { error: this.lastError, status: e?.status ?? null });
      throw e;
    }
  }

  async init() {
    this.status = 'starting';
    try {
      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: this.channelId } });
      if (!channel.isActive || !channel.botEnabled) throw new Error('channel_not_active');
      this.channelTwitchId = channel.twitchChannelId;
      this.ownerTwitchId = channel.twitchChannelId;
      this.twitchLogin = channel.twitchLogin;
      await this.validateAndLoadToken();
      this.status = 'connected';
      this.lastConnectedAt = new Date().toISOString();
      await this.logEvent('session_start', { twitchChannelId: this.channelTwitchId, twitchLogin: this.twitchLogin });
    } catch (e: any) {
      this.lastError = e?.message ?? 'init_failed';
      if (this.lastError === 'auth_required') this.status = 'auth_required';
      else if (this.lastError !== 'token_refresh_failed') this.status = 'error';
      await this.logEvent('session_error', { error: this.lastError });
      throw e;
    }
  }

  async ensureSubscription(sessionId: string) {
    if (this.status === 'reconnecting') this.reconnectCount += 1;
    if (!['connected', 'subscribed'].includes(this.status)) await this.init();
    try {
      await this.validateAndLoadToken();
      await this.api.createEventSubSubscription({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.channelTwitchId, user_id: this.ownerTwitchId }, sessionId, accessToken: this.accessToken });
      this.status = 'subscribed';
      this.subscriptionsCount += 1;
      this.lastSubscriptionAt = new Date().toISOString();
      await this.logEvent('eventsub_subscription_created', { sessionId, subscriptionsCount: this.subscriptionsCount });
    } catch (e: any) {
      this.status = e?.message?.includes('token') ? 'token_error' : 'error';
      this.lastError = e?.message ?? 'subscription_failed';
      await this.logEvent('eventsub_subscription_failed', { error: this.lastError, status: e?.status ?? null });
      throw e;
    }
  }

  markReconnect() {
    this.status = 'reconnecting';
    this.reconnectCount += 1;
    void this.logEvent('eventsub_reconnect', { reconnectCount: this.reconnectCount });
  }

  markConnected() {
    this.status = 'connected';
    this.lastConnectedAt = new Date().toISOString();
    void this.logEvent('eventsub_connected');
  }

  async stop(reason = 'manual_stop') {
    this.status = 'stopped';
    await this.logEvent('session_stop', { reason });
  }

  async handleNotification(payload: any) {
    const evt = payload?.event;
    if (!evt || evt.broadcaster_user_id !== this.channelTwitchId) return;
    this.lastMessageAt = new Date().toISOString();
    await recordChatMessage(this.channelId, Platform.twitch, evt.message_id ?? null, evt.chatter_user_id, evt.chatter_user_login, evt.message?.text ?? '');
    await this.logEvent('chat_message_received', { messageId: evt.message_id ?? null, userId: evt.chatter_user_id });
    const response = await this.botCore.handleMessage({ platform: 'twitch', channelId: this.channelId, externalMessageId: evt.message_id, userId: evt.chatter_user_id, username: evt.chatter_user_login, content: evt.message?.text ?? '', isMod: evt.chatter_is_moderator, isBroadcaster: evt.chatter_is_broadcaster }, new TenantContext(this.channelId, 'twitch'));
    if (response?.content) {
      try {
        await this.validateAndLoadToken();
        await this.api.sendChatMessage({ broadcasterId: this.channelTwitchId, senderId: this.ownerTwitchId, accessToken: this.accessToken, message: response.content });
        await this.logEvent('command_executed', { messageId: evt.message_id ?? null });
      } catch (e: any) {
        this.lastError = e?.message ?? 'command_failed';
        await this.logEvent('command_failed', { messageId: evt.message_id ?? null, error: this.lastError });
      }
    }
  }

  getHealth() {
    return { channelId: this.channelId, twitchChannelId: this.channelTwitchId, twitchLogin: this.twitchLogin, status: this.status, connected: ['connected', 'subscribed'].includes(this.status), subscribed: this.status === 'subscribed', lastError: this.lastError, lastConnectedAt: this.lastConnectedAt, lastMessageAt: this.lastMessageAt, lastSubscriptionAt: this.lastSubscriptionAt, reconnectCount: this.reconnectCount, subscriptionsCount: this.subscriptionsCount };
  }

  getBroadcasterTwitchId() { return this.channelTwitchId; }
}
