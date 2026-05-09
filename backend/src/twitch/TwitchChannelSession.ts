import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { BotCore } from '../core/BotCore.js';
import { TenantContext } from '../core/TenantContext.js';
import { eventBus } from '../core/EventBus.js';
import { TwitchApi } from './TwitchApi.js';
import { recordChatMessage } from '../services/communityService.js';
import { resolveChatSendAuth } from './chatSenderAuth.js';

export type TwitchSessionStatus = 'idle' | 'starting' | 'connected' | 'subscribed' | 'reconnecting' | 'stopped' | 'token_error' | 'error' | 'auth_required';

export class TwitchChannelSession {
  public status: TwitchSessionStatus = 'idle';
  public lastError: string | null = null;
  public lastConnectedAt: string | null = null;
  public lastMessageAt: string | null = null;
  public lastSubscriptionAt: string | null = null;
  public reconnectCount = 0;
  public subscriptionsCount = 0;

  private subscribedSessionId: string | null = null;
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
    if (this.subscribedSessionId === sessionId && this.status === 'subscribed') {
      await this.logEvent('ensure_subscription_skipped_already_subscribed', { sessionId, subscriptionsCount: this.subscriptionsCount });
      return this.getHealth();
    }
    if (!['connected', 'subscribed'].includes(this.status)) await this.init();
    try {
      await this.validateAndLoadToken();
      await this.api.createEventSubSubscription({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.channelTwitchId, user_id: this.ownerTwitchId }, sessionId, accessToken: this.accessToken });
      this.status = 'subscribed';
      this.subscribedSessionId = sessionId;
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
    const requestId = payload?.metadata?.message_id ?? null;
    try {
      const evt = payload?.event;
    if (!evt || evt.broadcaster_user_id !== this.channelTwitchId) return;
      this.lastMessageAt = new Date().toISOString();
      await this.logEvent('eventsub_notification_received', { messageId: evt.message_id ?? null, userId: evt.chatter_user_id });
      await this.logEvent('eventsub_chat_message_received', { messageId: evt.message_id ?? null, userId: evt.chatter_user_id });
      const result = await recordChatMessage(this.channelId, Platform.twitch, evt.message_id ?? null, evt.chatter_user_id, evt.chatter_user_login, evt.message?.text ?? '');
      const saved = result.message;
      if (result.duplicate) {
        await this.logEvent('chat_message_duplicate_skipped', { channelId: this.channelId, externalMessageId: evt.message_id ?? null, storedMessageId: saved.id });
        return;
      }
      await this.logEvent('chat_message_saved', { storedMessageId: saved.id, messageId: evt.message_id ?? null });
      await this.logEvent('community_user_updated', { userId: evt.chatter_user_id });
      const settings = await prisma.channelSettings.findUnique({ where: { channelId: this.channelId } });
      const prefix = settings?.commandPrefix ?? '!';
      const messageText = String(evt.message?.text ?? '');
      const isCommand = messageText.trimStart().startsWith(prefix);
      const liveEvent = {
        type: 'chat.message',
        message: {
          id: saved.id,
          externalMessageId: evt.message_id ?? null,
          username: evt.chatter_user_login,
          displayName: evt.chatter_user_name ?? evt.chatter_user_login,
          twitchUserId: evt.chatter_user_id,
          message: messageText,
          isCommand,
          createdAt: saved.createdAt.toISOString()
        }
      };
      await this.logEvent('live_chat_event_publish_begin', { storedMessageId: saved.id, externalMessageId: evt.message_id ?? null });
      try {
        eventBus.publish(this.channelId, liveEvent);
        await this.logEvent('live_chat_event_published', { storedMessageId: saved.id, externalMessageId: evt.message_id ?? null, subscriberCount: eventBus.getChannelStats(this.channelId).subscribers });
      } catch (publishError: any) {
        await this.logEvent('live_chat_event_publish_failed', { storedMessageId: saved.id, externalMessageId: evt.message_id ?? null, error: publishError?.message ?? 'unknown_publish_error' });
      }
      if (isCommand) await this.logEvent('command_detected', { messageId: evt.message_id ?? null, prefix });
      const response = await this.botCore.handleMessage({ platform: 'twitch', channelId: this.channelId, externalMessageId: evt.message_id, userId: evt.chatter_user_id, username: evt.chatter_user_login, content: evt.message?.text ?? '', isMod: evt.chatter_is_moderator, isBroadcaster: evt.chatter_is_broadcaster }, new TenantContext(this.channelId, 'twitch'));
      if (response?.content) {
      try {
        const sendAuth = await resolveChatSendAuth(this.channelId);
        if (!sendAuth.accessToken) throw new Error(`chat_send_token_${sendAuth.botTokenStatus}`);
        await this.api.sendChatMessage({ broadcasterId: sendAuth.broadcasterId, senderId: sendAuth.senderId, accessToken: sendAuth.accessToken, message: response.content });
        await this.logEvent('command_executed', { messageId: evt.message_id ?? null });
        } catch (e: any) {
        this.lastError = e?.message ?? 'command_failed';
        await this.logEvent('command_failed', { messageId: evt.message_id ?? null, error: this.lastError, requestId });
      }
    }
    } catch (e: any) {
    this.lastError = e?.message ?? 'eventsub_chat_message_failed';
    await this.logEvent('eventsub_chat_message_failed', { failedStep: 'handle_notification', requestId, channelId: this.channelId, error: this.lastError });
    throw e;
  }
  }

  getHealth() {
    return { channelId: this.channelId, twitchChannelId: this.channelTwitchId, twitchLogin: this.twitchLogin, status: this.status, connected: ['connected', 'subscribed'].includes(this.status), subscribed: this.status === 'subscribed', subscribedSessionIdPresent: Boolean(this.subscribedSessionId), lastError: this.lastError, lastConnectedAt: this.lastConnectedAt, lastMessageAt: this.lastMessageAt, lastSubscriptionAt: this.lastSubscriptionAt, reconnectCount: this.reconnectCount, subscriptionsCount: this.subscriptionsCount, sendAs: 'unknown' };
  }

  getBroadcasterTwitchId() { return this.channelTwitchId; }
}
