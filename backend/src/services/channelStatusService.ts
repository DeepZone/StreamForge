import { prisma } from '../db/prisma.js';
import { requireBroadcasterScopes } from './twitchTokenService.js';
import { TwitchApi, TwitchApiError } from '../twitch/TwitchApi.js';
import { twitchConnectionManager } from '../twitch/managerSingleton.js';

const twitchApi = new TwitchApi();
const SUB_SCOPE = 'channel:read:subscriptions';

export async function getChannelTwitchStatus(channelId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  const generatedAt = new Date().toISOString();
  const scopedToken = await requireBroadcasterScopes(channelId, []);
  const accessToken = scopedToken.token?.accessToken;

  let live = { isLive: false, viewerCount: 0, title: null as string | null, gameName: null as string | null, gameId: null as string | null, startedAt: null as string | null, durationSeconds: 0, thumbnailUrl: null as string | null };
  if (accessToken) {
    try {
      const stream = await twitchApi.getStreamByUserId({ userId: channel.twitchChannelId, accessToken });
      if (stream) {
        const started = new Date(stream.started_at);
        const durationSeconds = Number.isFinite(started.getTime()) ? Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000)) : 0;
        live = { isLive: true, viewerCount: stream.viewer_count ?? 0, title: stream.title ?? null, gameName: stream.game_name ?? null, gameId: stream.game_id ?? null, startedAt: stream.started_at ?? null, durationSeconds, thumbnailUrl: stream.thumbnail_url ?? null };
      }
    } catch {}
  }

  const subsScoped = await requireBroadcasterScopes(channelId, [SUB_SCOPE]);
  const subscribers = { available: false, count: null as number | null, points: null as number | null, missingScopes: [...subsScoped.missingScopes] };
  if (subsScoped.token && subsScoped.missingScopes.length === 0) {
    try {
      const subs = await twitchApi.getBroadcasterSubscriptionsCount({ broadcasterId: channel.twitchChannelId, accessToken: subsScoped.token.accessToken });
      subscribers.available = true;
      subscribers.count = subs.total;
      subscribers.missingScopes = [];
    } catch (error: any) {
      if (error instanceof TwitchApiError && (error.status === 401 || error.status === 403)) subscribers.missingScopes = [SUB_SCOPE];
    }
  }

  const health = twitchConnectionManager.health();
  const match = health.sessions.find((s: any) => s.channelId === channelId || s.twitchChannelId === channel.twitchChannelId);
  const status = await prisma.channelBotStatus.findUnique({ where: { channelId } });

  return {
    channelId,
    generatedAt,
    live,
    subscribers,
    streamHealth: {
      bitrateKbps: null,
      available: false,
      reason: 'Twitch Helix liefert keine echte Stream-Bitrate über den verwendeten Endpunkt.'
    },
    eventSub: {
      enabled: health.eventSubEnabled,
      connected: Boolean(match && ['connected', 'reconnecting', 'subscribed'].includes(match.status)),
      subscribed: Boolean(match?.subscribed),
      lastMessageAt: match?.lastMessageAt ?? null,
      lastError: match?.lastError ?? null
    },
    platformBot: {
      available: Boolean(status),
      canSend: Boolean(status?.isModerator),
      moderatorStatus: status?.status ?? 'unknown'
    }
  };
}
