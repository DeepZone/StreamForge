export const TWITCH_BROADCASTER_SCOPES = [
  // Identity for account/channel mapping in OAuth callback.
  'user:read:email',
  // Needed for receiving Twitch chat messages in this MVP EventSub flow.
  'user:read:chat',
  // Bot permission scope used by EventSub chat subscriptions for broadcaster context.
  'channel:bot',
  // Needed to read current chatters via Helix chatters endpoint.
  'moderator:read:chatters'
] as const;

export const TWITCH_BOT_ACCOUNT_SCOPES = [
  'user:read:email',
  'user:read:chat',
  'user:write:chat',
  'user:bot'
] as const;

export const hasRequiredBroadcasterScopes = (scopes: string[]) => {
  const set = new Set(scopes);
  return TWITCH_BROADCASTER_SCOPES.every((scope) => set.has(scope));
};
