import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import setupRoutes from './routes/setup.routes.js';
import authRoutes from './routes/auth.routes.js';
import channelsRoutes from './routes/channels.routes.js';
import commandsRoutes from './routes/commands.routes.js';
import timersRoutes from './routes/timers.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import adminRoutes from './routes/admin.routes.js';
import communityRoutes from './routes/community.routes.js';
import recapsRoutes from './routes/recaps.routes.js';

const app = Fastify();
app.register(cookie, { secret: env.sessionSecret });

const allowedOrigins = new Set([env.frontendUrl, 'http://localhost:4173', 'http://127.0.0.1:4173']);
app.register(cors, {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'), false);
  }
});

app.register(setupRoutes);
app.register(authRoutes);
app.register(channelsRoutes);
app.register(commandsRoutes);
app.register(timersRoutes);
app.register(campaignsRoutes);
app.register(adminRoutes);
app.register(communityRoutes);
app.register(recapsRoutes);

export default app;
