import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required');
}

const tokenKeySchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/u, 'TOKEN_ENCRYPTION_KEY must be a 64-char hex string for AES-256');

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  dbUrl: process.env.DATABASE_URL || '',
  sessionSecret,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  twitchClientId: process.env.TWITCH_CLIENT_ID || '',
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  twitchRedirectUri: process.env.TWITCH_REDIRECT_URI || '',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY || ''
};

export const hasTwitchOAuthConfig = () => Boolean(env.twitchClientId && env.twitchClientSecret && env.twitchRedirectUri);
export const assertTwitchOAuthConfig = () => {
  if (!hasTwitchOAuthConfig()) {
    throw new Error('Twitch OAuth not configured. Missing TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET or TWITCH_REDIRECT_URI');
  }
};

export const assertTokenEncryptionKey = () => {
  const result = tokenKeySchema.safeParse(env.tokenKey);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message || 'Invalid TOKEN_ENCRYPTION_KEY');
  }
};
