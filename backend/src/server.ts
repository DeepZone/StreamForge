import app from './app.js';import { env } from './config/env.js';
import { twitchConnectionManager } from './twitch/managerSingleton.js';

app.listen({port:env.port,host:'0.0.0.0'}).then(async()=>{console.log('backend running'); if(env.twitchEventSubEnabled){await twitchConnectionManager.startAll();}});
