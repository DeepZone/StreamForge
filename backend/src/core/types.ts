export type Platform = 'twitch' | 'discord';
export interface BotMessage {
  platform: Platform;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  externalMessageId?: string;
  isMod?: boolean;
  isBroadcaster?: boolean;
}
export interface BotResponse {
  content: string;
}
