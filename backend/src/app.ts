import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { z } from 'zod';
import { env, getMissingTwitchOAuthEnvVars, isTokenEncryptionKeyValid } from './config/env.js';
import setupRoutes from './routes/setup.routes.js';
import authRoutes from './routes/auth.routes.js';
import channelsRoutes from './routes/channels.routes.js';
import commandsRoutes from './routes/commands.routes.js';
import timersRoutes from './routes/timers.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import adminRoutes from './routes/admin.routes.js';
import communityRoutes from './routes/community.routes.js';
import recapsRoutes from './routes/recaps.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import channelSettingsRoutes from './routes/channelSettings.routes.js';
import channelLogsRoutes from './routes/channelLogs.routes.js';
import liveChatRoutes from './routes/liveChat.routes.js';
import chattersRoutes from './routes/chatters.routes.js';
import twitchRolesRoutes from './routes/twitchRoles.routes.js';
import twitchModerationRoutes from './routes/twitchModeration.routes.js';
import platformBotRoutes from './routes/platformBot.routes.js';
import channelDebugRoutes from './routes/channelDebug.routes.js';
import { TWITCH_BROADCASTER_SCOPES } from './twitch/scopes.js';

const app = Fastify({ trustProxy: env.trustProxy, bodyLimit: 256 * 1024, disableRequestLogging: true });
app.register(cookie, { secret: env.sessionSecret });
const allowedOrigins = new Set(env.nodeEnv === 'production' ? env.allowedOrigins : [...env.allowedOrigins, 'http://localhost:4173', 'http://127.0.0.1:4173', env.frontendUrl, env.publicAppUrl]);
app.register(cors, { credentials: true, origin: (origin, cb) => { if (!origin || allowedOrigins.has(origin)) { cb(null, true); return; } cb(new Error('origin_forbidden'), false); } });

const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) }).strict();
const setupSchema = z.object({ displayName: z.string().min(2).max(64), email: z.string().email().max(320), password: z.string().min(12).max(128) }).strict();

app.addHook('preValidation', async (req, rep) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && env.nodeEnv === 'production') {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return rep.code(403).send({ errorCode: 'csrf.origin_forbidden', requestId: req.id });
  }
  if (req.method === 'POST' && req.url === '/api/auth/login') { const ok = loginSchema.safeParse(req.body); if (!ok.success) return rep.code(400).send({ errorCode: 'validation.failed', requestId: req.id, details: ok.error.issues.map((x) => ({ field: x.path.join('.'), message: x.message })) }); }
  if (req.method === 'POST' && req.url === '/api/setup/create-owner') { const ok = setupSchema.safeParse(req.body); if (!ok.success) return rep.code(400).send({ errorCode: 'validation.failed', requestId: req.id, details: ok.error.issues.map((x) => ({ field: x.path.join('.'), message: x.message })) }); }
});

app.addHook('onSend', async (_req, rep) => { rep.header('X-Content-Type-Options', 'nosniff'); rep.header('Referrer-Policy', 'no-referrer'); rep.header('X-Frame-Options', 'DENY'); rep.header('Cross-Origin-Resource-Policy', 'same-site'); if (env.nodeEnv === 'production') rep.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains; preload'); });
app.setNotFoundHandler((req, rep) => rep.code(404).send({ errorCode: 'route.not_found', requestId: req.id }));
app.setErrorHandler((err, req, rep) => { if ((err as any).statusCode === 413) return rep.code(413).send({ errorCode: 'request.payload_too_large', requestId: req.id }); if (err.code === 'FST_ERR_CTP_INVALID_JSON_BODY') return rep.code(400).send({ errorCode: 'request.invalid_json', requestId: req.id }); if (err.message === 'origin_forbidden') return rep.code(403).send({ errorCode: 'cors.origin_forbidden', requestId: req.id }); rep.code((err as any).statusCode || 500).send({ errorCode: 'internal.error', requestId: req.id }); });


app.get('/api/public/health', async () => ({ ok: true, service: 'streamforge-api' }));

app.get('/api/public/twitch/config', async () => ({
  oauthConfigured: Boolean(env.twitchClientId && env.twitchClientSecret && env.twitchRedirectUri),
  redirectUri: env.twitchRedirectUri,
  publicApiUrl: env.publicApiUrl,
  publicAppUrl: env.publicAppUrl,
  hasClientId: Boolean(env.twitchClientId),
  hasClientSecret: Boolean(env.twitchClientSecret),
  hasTokenEncryptionKey: Boolean(env.tokenKey),
  tokenEncryptionKeyValid: isTokenEncryptionKeyValid(),
  eventSubEnabled: env.twitchEventSubEnabled,
  scopes: [...TWITCH_BROADCASTER_SCOPES]
}));

app.get('/api/public/twitch/oauth-url', async () => {
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.twitchClientId || 'missing_client_id');
  url.searchParams.set('redirect_uri', env.twitchRedirectUri);
  url.searchParams.set('scope', TWITCH_BROADCASTER_SCOPES.join(' '));
  return { authorizeUrl: url.toString(), redirectUri: env.twitchRedirectUri, scopes: [...TWITCH_BROADCASTER_SCOPES] };
});

app.register(setupRoutes); app.register(authRoutes); app.register(channelsRoutes); app.register(channelSettingsRoutes); app.register(channelLogsRoutes); app.register(liveChatRoutes); app.register(chattersRoutes); app.register(twitchRolesRoutes); app.register(twitchModerationRoutes); app.register(platformBotRoutes); app.register(channelDebugRoutes); app.register(commandsRoutes); app.register(timersRoutes); app.register(campaignsRoutes); app.register(adminRoutes); app.register(communityRoutes); app.register(recapsRoutes); app.register(moderationRoutes);
export default app;
