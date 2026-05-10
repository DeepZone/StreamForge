import { assertTwitchOAuthConfig, env } from '../config/env.js';

export type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string[]; token_type: string };
type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string };
type TwitchChatter = { user_id: string; user_login: string; user_name: string };
export type TwitchEventSubSubscription = {
  id: string;
  status: string;
  type: string;
  version: string;
  condition?: Record<string, string>;
  transport?: { method?: string; session_id?: string | null };
};

export class TwitchApiError extends Error {
  status: number;
  context: string;
  safeMessage: string;
  twitchError?: any;

  constructor(context: string, status: number, safeMessage: string, twitchError?: any) {
    super(safeMessage);
    this.name = 'TwitchApiError';
    this.status = status;
    this.context = context;
    this.safeMessage = safeMessage;
    this.twitchError = twitchError;
  }
}

export class TwitchApi {
  private async parseResponse<T>(res: Response, context: string): Promise<T> {
    const rawText = await res.text();
    let body: any = {};
    if (rawText) {
      try { body = JSON.parse(rawText); } catch { body = { message: rawText.slice(0, 300) }; }
    }
    if (!res.ok) {
      const safeMessage = typeof body?.message === 'string' ? body.message : (typeof body?.error_description === 'string' ? body.error_description : (typeof body?.error === 'string' ? body.error : `twitch_${context}_failed`));
      throw new TwitchApiError(context, res.status, safeMessage, body);
    }
    return body as T;
  }

  private baseHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, 'Client-Id': env.twitchClientId, 'Content-Type': 'application/json' };
  }

  async exchangeCodeForToken(code: string, redirectUri?: string): Promise<TokenResponse> {
    assertTwitchOAuthConfig();
    const payload = new URLSearchParams({ client_id: env.twitchClientId, client_secret: env.twitchClientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri || env.twitchRedirectUri });
    const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload.toString() });
    return this.parseResponse<TokenResponse>(res, 'exchange_code');
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    assertTwitchOAuthConfig();
    const payload = new URLSearchParams({ client_id: env.twitchClientId, client_secret: env.twitchClientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
    const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload.toString() });
    return this.parseResponse<TokenResponse>(res, 'refresh_token');
  }

  async getCurrentUser(accessToken: string): Promise<TwitchUser> {
    assertTwitchOAuthConfig();
    const res = await fetch('https://api.twitch.tv/helix/users', { headers: this.baseHeaders(accessToken) });
    const data = await this.parseResponse<{ data: TwitchUser[] }>(res, 'get_current_user');
    if (!data.data[0]) throw new TwitchApiError('get_current_user', 502, 'twitch_user_not_found');
    return data.data[0];
  }

  async sendChatMessage(params: { broadcasterId: string; senderId: string; accessToken: string; message: string; replyParentMessageId?: string }) {
    const message = String(params.message ?? '').slice(0, 500);
    const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: this.baseHeaders(params.accessToken),
      body: JSON.stringify({
        broadcaster_id: params.broadcasterId,
        sender_id: params.senderId,
        message,
        ...(params.replyParentMessageId ? { reply_parent_message_id: params.replyParentMessageId } : {})
      })
    });
    return this.parseResponse<{ data?: Array<{ message_id?: string; is_sent?: boolean; drop_reason?: { code?: string; message?: string } }> }>(res, 'send_chat_message');
  }

  async createEventSubSubscription(params: { type: string; version: string; condition: Record<string, string>; sessionId: string; accessToken: string }) {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { method: 'POST', headers: this.baseHeaders(params.accessToken), body: JSON.stringify({ type: params.type, version: params.version, condition: params.condition, transport: { method: 'websocket', session_id: params.sessionId } }) });
    return this.parseResponse(res, 'create_eventsub_subscription');
  }

  async deleteEventSubSubscription(params: { accessToken: string; subscriptionId: string }) {
    const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(params.subscriptionId)}`, { method: 'DELETE', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'delete_eventsub_subscription');
  }

  async listEventSubSubscriptions(params: { accessToken: string; type?: string; status?: string; userId?: string; after?: string; first?: number }) {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');
    if (params.type) url.searchParams.set('type', params.type);
    if (params.status) url.searchParams.set('status', params.status);
    if (params.userId) url.searchParams.set('user_id', params.userId);
    if (params.after) url.searchParams.set('after', params.after);
    if (typeof params.first === 'number') url.searchParams.set('first', String(Math.min(Math.max(params.first, 1), 100)));
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: TwitchEventSubSubscription[]; pagination?: { cursor?: string | null } }>(res, 'list_eventsub_subscriptions');
  }

  async getChatters(params: { broadcasterId: string; moderatorId: string; accessToken: string; first?: number; after?: string }) {
    const first = Math.min(Math.max(params.first ?? 100, 1), 1000);
    const url = new URL('https://api.twitch.tv/helix/chat/chatters');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('moderator_id', params.moderatorId);
    url.searchParams.set('first', String(first));
    if (params.after) url.searchParams.set('after', params.after);
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: TwitchChatter[]; pagination?: { cursor?: string }; total?: number }>(res, 'get_chatters');
  }


  async getBannedUsers(params: { broadcasterId: string; accessToken: string; userId?: string; first?: number; after?: string }) {
    const first = Math.min(Math.max(params.first ?? 100, 1), 100);
    const url = new URL('https://api.twitch.tv/helix/moderation/banned');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    if (params.userId) url.searchParams.set('user_id', params.userId);
    url.searchParams.set('first', String(first));
    if (params.after) url.searchParams.set('after', params.after);
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: Array<{ user_id: string; user_login: string; user_name: string; expires_at: string | null; created_at?: string | null; reason?: string | null; moderator_id?: string | null; moderator_login?: string | null; moderator_name?: string | null }>; pagination?: { cursor?: string } }>(res, 'get_banned_users');
  }

  async banUser(params: { broadcasterId: string; moderatorId: string; userId: string; reason?: string; accessToken: string }) {
    const reason = params.reason?.slice(0, 500);
    const res = await fetch('https://api.twitch.tv/helix/moderation/bans', {
      method: 'POST',
      headers: this.baseHeaders(params.accessToken),
      body: JSON.stringify({ broadcaster_id: params.broadcasterId, moderator_id: params.moderatorId, data: { user_id: params.userId, ...(reason ? { reason } : {}) } })
    });
    return this.parseResponse(res, 'ban_user');
  }

  async timeoutUser(params: { broadcasterId: string; moderatorId: string; userId: string; durationSeconds: number; reason?: string; accessToken: string }) {
    const duration = Math.min(1209600, Math.max(1, Math.floor(params.durationSeconds)));
    const reason = params.reason?.slice(0, 500);
    const res = await fetch('https://api.twitch.tv/helix/moderation/bans', {
      method: 'POST',
      headers: this.baseHeaders(params.accessToken),
      body: JSON.stringify({ broadcaster_id: params.broadcasterId, moderator_id: params.moderatorId, data: { user_id: params.userId, duration, ...(reason ? { reason } : {}) } })
    });
    return this.parseResponse(res, 'timeout_user');
  }

  async unbanUser(params: { broadcasterId: string; moderatorId: string; userId: string; accessToken: string }) {
    const url = new URL('https://api.twitch.tv/helix/moderation/bans');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('moderator_id', params.moderatorId);
    url.searchParams.set('user_id', params.userId);
    const res = await fetch(url.toString(), { method: 'DELETE', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'unban_user');
    return { ok: true };
  }

  async getChannelModerators(params: { broadcasterId: string; accessToken: string; userId?: string; first?: number; after?: string }) {
    const first = Math.min(Math.max(params.first ?? 100, 1), 100);
    const url = new URL('https://api.twitch.tv/helix/moderation/moderators');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('first', String(first));
    if (params.userId) url.searchParams.set('user_id', params.userId);
    if (params.after) url.searchParams.set('after', params.after);
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: Array<{ user_id: string; user_login: string; user_name: string }>; pagination?: { cursor?: string } }>(res, 'get_channel_moderators');
  }

  async addChannelModerator(params: { broadcasterId: string; userId: string; accessToken: string }) {
    const url = new URL('https://api.twitch.tv/helix/moderation/moderators');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('user_id', params.userId);
    const res = await fetch(url.toString(), { method: 'POST', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'add_channel_moderator');
    return { ok: true };
  }

  async removeChannelModerator(params: { broadcasterId: string; userId: string; accessToken: string }) {
    const url = new URL('https://api.twitch.tv/helix/moderation/moderators');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('user_id', params.userId);
    const res = await fetch(url.toString(), { method: 'DELETE', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'remove_channel_moderator');
    return { ok: true };
  }

  async getChannelVips(params: { broadcasterId: string; accessToken: string; userId?: string; first?: number; after?: string }) {
    const first = Math.min(Math.max(params.first ?? 100, 1), 100);
    const url = new URL('https://api.twitch.tv/helix/channels/vips');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('first', String(first));
    if (params.userId) url.searchParams.set('user_id', params.userId);
    if (params.after) url.searchParams.set('after', params.after);
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: Array<{ user_id: string; user_login: string; user_name: string }>; pagination?: { cursor?: string } }>(res, 'get_channel_vips');
  }

  async addChannelVip(params: { broadcasterId: string; userId: string; accessToken: string }) {
    const url = new URL('https://api.twitch.tv/helix/channels/vips');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('user_id', params.userId);
    const res = await fetch(url.toString(), { method: 'POST', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'add_channel_vip');
    return { ok: true };
  }

  async removeChannelVip(params: { broadcasterId: string; userId: string; accessToken: string }) {
    const url = new URL('https://api.twitch.tv/helix/channels/vips');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('user_id', params.userId);
    const res = await fetch(url.toString(), { method: 'DELETE', headers: this.baseHeaders(params.accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'remove_channel_vip');
    return { ok: true };
  }

}
