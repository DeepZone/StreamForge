import { FastifyPluginAsync } from 'fastify';
import { AuthedRequest, requireAuth, requireChannelRole } from '../auth/guards.js';
import { prisma } from '../db/prisma.js';
import { eventBus } from '../core/EventBus.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/api/channels/:channelId/twitch/debug', { preHandler: requireAuth }, async (req, rep) => {
    await requireChannelRole(req as AuthedRequest, rep, 'channel_admin');
    const { channelId } = req.params as { channelId: string };
    const [channel, bot, botStatus, token] = await Promise.all([
      prisma.channel.findUnique({ where: { id: channelId } }),
      prisma.platformTwitchBot.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.channelBotStatus.findUnique({ where: { channelId } }),
      prisma.twitchToken.findUnique({ where: { channelId } })
    ]);
    if (!channel) return rep.code(404).send({ errorCode: 'channel.not_found' });
    const managerHealth = (await import('../twitch/managerSingleton.js')).twitchConnectionManager.health();
    const session = managerHealth.sessions.find((s: any) => s.channelId === channelId);
    return { channel: { id: channel.id, twitchLogin: channel.twitchLogin, twitchChannelId: channel.twitchChannelId, isActive: channel.isActive, botEnabled: channel.botEnabled }, session: { exists: Boolean(session), status: session?.status ?? 'missing' }, liveStream: eventBus.getChannelStats(channelId), tokens: { hasBroadcasterToken: Boolean(token), broadcasterScopes: token ? JSON.parse(token.scopesJson || '[]') : [], hasPlatformBotToken: Boolean(bot?.accessTokenEncrypted), platformBotScopes: bot ? JSON.parse(bot.scopesJson || '[]') : [] }, platformBot: { connected: Boolean(bot), moderatorStatus: botStatus?.status ?? 'unknown', canSendAsPlatformBot: Boolean(botStatus?.isModerator) } };
  });
};
export default routes;
