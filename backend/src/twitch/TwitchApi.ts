import { assertTwitchOAuthConfig, env } from '../config/env.js';

export type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string[]; token_type: string };
type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string };
type TwitchChatter = { user_id: string; user_login: string; user_name: string };

export class TwitchApiError extends Error {
  status: number;
  context: string;
  safeMessage: string;

  constructor(context: string, status: number, safeMessage: string) {
    super(safeMessage);
    this.name = 'TwitchApiError';
    this.status = status;
    this.context = context;
    this.safeMessage = safeMessage;
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
      throw new TwitchApiError(context, res.status, safeMessage);
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

  async sendChatMessage(params: { broadcasterId: string; senderId: string; accessToken: string; message: string }) {
    const res = await fetch('https://api.twitch.tv/helix/chat/messages', { method: 'POST', headers: this.baseHeaders(params.accessToken), body: JSON.stringify({ broadcaster_id: params.broadcasterId, sender_id: params.senderId, message: params.message }) });
    return this.parseResponse(res, 'send_chat_message');
  }

  async createEventSubSubscription(params: { type: string; version: string; condition: Record<string, string>; sessionId: string; accessToken: string }) {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { method: 'POST', headers: this.baseHeaders(params.accessToken), body: JSON.stringify({ type: params.type, version: params.version, condition: params.condition, transport: { method: 'websocket', session_id: params.sessionId } }) });
    return this.parseResponse(res, 'create_eventsub_subscription');
  }

  async deleteEventSubSubscription(subscriptionId: string, accessToken: string) {
    const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(subscriptionId)}`, { method: 'DELETE', headers: this.baseHeaders(accessToken) });
    if (!res.ok && res.status !== 204) await this.parseResponse(res, 'delete_eventsub_subscription');
  }

  async getEventSubSubscriptions(accessToken: string) {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { headers: this.baseHeaders(accessToken) });
    return this.parseResponse(res, 'get_eventsub_subscriptions');
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


  async getBannedUsers(params: { broadcasterId: string; moderatorId: string; accessToken: string; first?: number; after?: string }) {
    const first = Math.min(Math.max(params.first ?? 100, 1), 100);
    const url = new URL('https://api.twitch.tv/helix/moderation/banned');
    url.searchParams.set('broadcaster_id', params.broadcasterId);
    url.searchParams.set('moderator_id', params.moderatorId);
    url.searchParams.set('first', String(first));
    if (params.after) url.searchParams.set('after', params.after);
    const res = await fetch(url.toString(), { headers: this.baseHeaders(params.accessToken) });
    return this.parseResponse<{ data: Array<{ user_id: string; user_login: string; user_name: string; expires_at: string | null; reason: string }>; pagination?: { cursor?: string } }>(res, 'get_banned_users');
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

}
