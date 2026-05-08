export const TWITCH_MVP_SCOPES = [
  // Identity for account/channel mapping in OAuth callback.
  'user:read:email',
  // Needed for receiving/sending Twitch chat messages in this MVP EventSub flow.
  'user:read:chat',
  'user:write:chat',
  // Bot permission scopes used by EventSub chat subscriptions.
  'channel:bot',
  'user:bot'
] as const;

export const hasRequiredScopes = (scopes: string[]) => {
  const set = new Set(scopes);
  return TWITCH_MVP_SCOPES.every((scope) => set.has(scope));
};
