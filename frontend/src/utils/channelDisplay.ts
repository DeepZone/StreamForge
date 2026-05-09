export type ChannelLike = {
  id?: string | null;
  twitchChannelId?: string | null;
  twitchLogin?: string | null;
  displayName?: string | null;
};

const UNKNOWN_CHANNEL = 'Unbekannter Channel';

export function truncateId(value?: string | null, length = 8): string {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function getChannelDisplayName(channel?: ChannelLike | null): string {
  if (!channel) return UNKNOWN_CHANNEL;
  return channel.displayName || channel.twitchLogin || channel.twitchChannelId || channel.id || UNKNOWN_CHANNEL;
}

export function getChannelHandle(channel?: ChannelLike | null): string {
  if (!channel?.twitchLogin) return '';
  return `@${channel.twitchLogin}`;
}

export function isFallbackChannelName(channel?: ChannelLike | null): boolean {
  if (!channel) return true;
  return !channel.displayName && !channel.twitchLogin;
}
