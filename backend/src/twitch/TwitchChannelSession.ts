import { Platform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { decryptSecret } from '../utils/crypto.js';
import { BotCore } from '../core/BotCore.js';
import { TenantContext } from '../core/TenantContext.js';
import { TwitchApi } from './TwitchApi.js';
import { recordChatMessage } from '../services/communityService.js';

export class TwitchChannelSession {
  public status = 'idle'; public lastError: string | null = null;
  private channelTwitchId = ''; private accessToken = ''; private ownerTwitchId = '';
  constructor(public channelId: string, private api: TwitchApi, private botCore: BotCore) {}
  async init() {
    try {
      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: this.channelId } });
      if (!channel.isActive || !channel.botEnabled) throw new Error('channel_not_active');
      const token = await prisma.twitchToken.findUnique({ where: { channelId: this.channelId } }); if (!token) throw new Error('missing_token');
      this.accessToken = decryptSecret(token.accessTokenEncrypted);
      this.channelTwitchId = channel.twitchChannelId;
      this.ownerTwitchId = channel.twitchChannelId;
      this.status = 'ready';
    } catch (e: any) { this.status = 'error'; this.lastError = e?.message ?? 'init_failed'; throw e; }
  }
  async ensureSubscription(sessionId: string) {
    if (this.status !== 'ready') await this.init();
    await this.api.createEventSubSubscription({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.channelTwitchId, user_id: this.ownerTwitchId }, sessionId, accessToken: this.accessToken });
    this.status = 'subscribed';
  }
  async handleNotification(payload: any) {
    const evt = payload?.event; if (!evt || evt.broadcaster_user_id !== this.channelTwitchId) return;
    await recordChatMessage(this.channelId, Platform.twitch, evt.message_id ?? null, evt.chatter_user_id, evt.chatter_user_login, evt.message?.text ?? '');
    const response = await this.botCore.handleMessage({ platform: 'twitch', channelId: this.channelId, externalMessageId: evt.message_id, userId: evt.chatter_user_id, username: evt.chatter_user_login, content: evt.message?.text ?? '', isMod: evt.chatter_is_moderator, isBroadcaster: evt.chatter_is_broadcaster }, new TenantContext(this.channelId, 'twitch'));
    if (response?.content) await this.api.sendChatMessage({ broadcasterId: this.channelTwitchId, senderId: this.ownerTwitchId, accessToken: this.accessToken, message: response.content });
    await prisma.botEvent.create({ data: { channelId: this.channelId, platform: Platform.twitch, eventType: 'chat_message', payloadJson: JSON.stringify({ messageId: evt.message_id }) } });
  }
  getBroadcasterTwitchId() { return this.channelTwitchId; }
}
