import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().default(''),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  FRONTEND_URL: z.string().url().default('http://192.168.58.158:4173'),
  BACKEND_URL: z.string().url().default('http://192.168.58.158:8000'),
  PUBLIC_APP_URL: z.string().url().default('https://www.streamforge-bot.com'),
  PUBLIC_API_URL: z.string().url().default('https://www.streamforge-bot.com/api'),
  TRUST_PROXY: z.coerce.boolean().default(true),
  ALLOWED_ORIGINS: z.string().default('https://www.streamforge-bot.com'),
  COOKIE_SECURE: z.coerce.boolean().default(true),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  TWITCH_REDIRECT_URI: z.string().default(''),
  TWITCH_EVENTSUB_ENABLED: z.coerce.boolean().default(false),
  TWITCH_EVENTSUB_DEBUG: z.coerce.boolean().default(false)
});

const parsed = schema.parse(process.env);
const tokenKeySchema = z.string().regex(/^[0-9a-fA-F]{64}$/u, 'TOKEN_ENCRYPTION_KEY must be a 64-char hex string for AES-256');

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  dbUrl: parsed.DATABASE_URL,
  sessionSecret: parsed.SESSION_SECRET,
  frontendUrl: parsed.FRONTEND_URL,
  backendUrl: parsed.BACKEND_URL,
  publicAppUrl: parsed.PUBLIC_APP_URL,
  publicApiUrl: parsed.PUBLIC_API_URL,
  trustProxy: parsed.TRUST_PROXY,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean),
  cookieSecure: parsed.COOKIE_SECURE,
  cookieSameSite: parsed.COOKIE_SAME_SITE,
  rateLimitEnabled: parsed.RATE_LIMIT_ENABLED,
  twitchClientId: parsed.TWITCH_CLIENT_ID,
  twitchClientSecret: parsed.TWITCH_CLIENT_SECRET,
  twitchRedirectUri: parsed.TWITCH_REDIRECT_URI || `${parsed.BACKEND_URL.replace(/\/$/u, '')}/api/auth/twitch/callback`,
  tokenKey: parsed.TOKEN_ENCRYPTION_KEY,
  twitchEventSubEnabled: parsed.TWITCH_EVENTSUB_ENABLED,
  twitchEventSubDebug: parsed.TWITCH_EVENTSUB_DEBUG
};

export const hasTwitchOAuthConfig = () => Boolean(env.twitchClientId && env.twitchClientSecret && env.twitchRedirectUri);
export const assertTwitchOAuthConfig = () => { if (!hasTwitchOAuthConfig()) throw new Error('Twitch OAuth not configured.'); };
export const getMissingTwitchOAuthEnvVars = () => [
  ['TWITCH_CLIENT_ID', env.twitchClientId],
  ['TWITCH_CLIENT_SECRET', env.twitchClientSecret],
  ['TWITCH_REDIRECT_URI', parsed.TWITCH_REDIRECT_URI]
].filter(([, value]) => !value).map(([key]) => key);
export const assertTokenEncryptionKey = () => { const result = tokenKeySchema.safeParse(env.tokenKey); if (!result.success) throw new Error(result.error.issues[0]?.message || 'Invalid TOKEN_ENCRYPTION_KEY'); };
