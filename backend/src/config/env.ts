import dotenv from 'dotenv'; dotenv.config();
export const env = {
  port: Number(process.env.PORT || 3000), dbUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'dev', tokenKey: process.env.TOKEN_ENCRYPTION_KEY || '0'.repeat(64),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173', backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  twitchClientId: process.env.TWITCH_CLIENT_ID || '', twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '', twitchRedirectUri: process.env.TWITCH_REDIRECT_URI || ''
};
