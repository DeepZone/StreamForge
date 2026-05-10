import { prisma } from '../db/prisma.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { TwitchApi } from '../twitch/TwitchApi.js';

const twitchApi = new TwitchApi();

export type BroadcasterToken = {
  channelId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
};

export async function refreshBroadcasterTokenIfNeeded(token: BroadcasterToken): Promise<BroadcasterToken> {
  if (token.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) return token;

  const refreshed = await twitchApi.refreshAccessToken(token.refreshToken);
  const updated: BroadcasterToken = {
    ...token,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || token.refreshToken,
    scopes: refreshed.scope ?? token.scopes,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
  };

  await prisma.twitchToken.update({
    where: { channelId: token.channelId },
    data: {
      accessTokenEncrypted: encryptSecret(updated.accessToken),
      refreshTokenEncrypted: encryptSecret(updated.refreshToken),
      expiresAt: updated.expiresAt,
      scopesJson: JSON.stringify(updated.scopes)
    }
  });

  return updated;
}

export async function getBroadcasterTokenForChannel(channelId: string): Promise<BroadcasterToken | null> {
  const token = await prisma.twitchToken.findUnique({ where: { channelId } });
  if (!token) return null;

  let parsed: BroadcasterToken;
  try {
    parsed = {
      channelId,
      accessToken: decryptSecret(token.accessTokenEncrypted),
      refreshToken: decryptSecret(token.refreshTokenEncrypted),
      scopes: JSON.parse(token.scopesJson || '[]'),
      expiresAt: token.expiresAt
    };
  } catch {
    return null;
  }

  try {
    return await refreshBroadcasterTokenIfNeeded(parsed);
  } catch {
    return null;
  }
}

export async function requireBroadcasterScopes(channelId: string, scopes: string[]): Promise<{ token: BroadcasterToken | null; missingScopes: string[] }> {
  const token = await getBroadcasterTokenForChannel(channelId);
  if (!token) return { token: null, missingScopes: scopes };
  const missingScopes = scopes.filter((scope) => !token.scopes.includes(scope));
  return { token, missingScopes };
}
