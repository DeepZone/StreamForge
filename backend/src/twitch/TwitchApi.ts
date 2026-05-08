import { assertTwitchOAuthConfig, env } from '../config/env.js';

export type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string[]; token_type: string };
type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string };

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
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const safeMessage = typeof body?.message === 'string' ? body.message : (typeof body?.error === 'string' ? body.error : `twitch_${context}_failed`);
      throw new TwitchApiError(context, res.status, safeMessage);
    }
    return body as T;
  }

  private baseHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, 'Client-Id': env.twitchClientId, 'Content-Type': 'application/json' };
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    assertTwitchOAuthConfig();
    const payload = new URLSearchParams({ client_id: env.twitchClientId, client_secret: env.twitchClientSecret, code, grant_type: 'authorization_code', redirect_uri: env.twitchRedirectUri });
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
}
