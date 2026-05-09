import { prisma } from '../db/prisma.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { TwitchApi } from './TwitchApi.js';

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type ChatSendAuth = {
  broadcasterId: string;
  senderId: string;
  accessToken: string;
  sendAs: 'broadcaster' | 'bot_account';
  botAccountLogin?: string;
  botTokenStatus: 'ok' | 'missing' | 'expired' | 'token_error';
};

const api = new TwitchApi();

const refreshTokenIfNeeded = async (source: 'broadcaster' | 'bot_account', tokenRow: { expiresAt: Date; accessTokenEncrypted: string; refreshTokenEncrypted: string; scopesJson: string; channelId?: string; id?: string; }) => {
  let accessToken = '';
  let refreshToken = '';
  let scopes: string[] = [];
  try {
    accessToken = decryptSecret(tokenRow.accessTokenEncrypted);
    refreshToken = decryptSecret(tokenRow.refreshTokenEncrypted);
    scopes = JSON.parse(tokenRow.scopesJson || '[]');
  } catch {
    throw new Error('token_decrypt_failed');
  }

  if (tokenRow.expiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS) return { accessToken, scopes };

  const refreshed = await api.refreshAccessToken(refreshToken);
  accessToken = refreshed.access_token;
  scopes = refreshed.scope ?? scopes;
  const data = {
    accessTokenEncrypted: encryptSecret(refreshed.access_token),
    refreshTokenEncrypted: encryptSecret(refreshed.refresh_token || refreshToken),
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    scopesJson: JSON.stringify(scopes)
  };

  if (source === 'broadcaster') await prisma.twitchToken.update({ where: { channelId: tokenRow.channelId! }, data });
  else await prisma.twitchBotAccount.update({ where: { id: tokenRow.id! }, data });
  return { accessToken, scopes };
};

export const resolveChatSendAuth = async (channelId: string): Promise<ChatSendAuth> => {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, include: { tokens: true, botAccountLinks: { where: { enabled: true }, include: { botAccount: true } } } });
  if (!channel) throw new Error('channel_not_found');
  const link = channel.botAccountLinks[0];

  if (link?.botAccount) {
    try {
      const refreshed = await refreshTokenIfNeeded('bot_account', { ...link.botAccount, id: link.botAccount.id });
      return { broadcasterId: channel.twitchChannelId, senderId: link.botAccount.twitchUserId, accessToken: refreshed.accessToken, sendAs: 'bot_account', botAccountLogin: link.botAccount.twitchLogin, botTokenStatus: 'ok' };
    } catch {
      return { broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken: '', sendAs: 'broadcaster', botAccountLogin: link.botAccount.twitchLogin, botTokenStatus: 'token_error' };
    }
  }

  const token = channel.tokens;
  if (!token) return { broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken: '', sendAs: 'broadcaster', botTokenStatus: 'missing' };
  try {
    const refreshed = await refreshTokenIfNeeded('broadcaster', { ...token, channelId: token.channelId });
    return { broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken: refreshed.accessToken, sendAs: 'broadcaster', botTokenStatus: 'missing' };
  } catch {
    return { broadcasterId: channel.twitchChannelId, senderId: channel.twitchChannelId, accessToken: '', sendAs: 'broadcaster', botTokenStatus: 'expired' };
  }
};
