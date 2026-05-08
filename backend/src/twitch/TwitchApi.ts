import { assertTwitchOAuthConfig, env } from '../config/env.js';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

export class TwitchApi {
  private async parseResponse<T>(res: Response, context: string): Promise<T> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[twitch-api] request failed', { context, status: res.status, message: body?.message ?? 'unknown' });
      throw new Error(`twitch_${context}_failed`);
    }
    return body as T;
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    assertTwitchOAuthConfig();
    const payload = new URLSearchParams({
      client_id: env.twitchClientId,
      client_secret: env.twitchClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.twitchRedirectUri
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${payload.toString()}`, { method: 'POST' });
    return this.parseResponse<TokenResponse>(res, 'exchange_code');
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    assertTwitchOAuthConfig();
    const payload = new URLSearchParams({
      client_id: env.twitchClientId,
      client_secret: env.twitchClientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${payload.toString()}`, { method: 'POST' });
    return this.parseResponse<TokenResponse>(res, 'refresh_token');
  }

  async getCurrentUser(accessToken: string): Promise<TwitchUser> {
    assertTwitchOAuthConfig();
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': env.twitchClientId
      }
    });
    const data = await this.parseResponse<{ data: TwitchUser[] }>(res, 'get_current_user');
    if (!data.data[0]) throw new Error('twitch_user_not_found');
    return data.data[0];
  }
}
