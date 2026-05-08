import app from './app.js';import { env } from './config/env.js';
app.listen({port:env.port,host:'0.0.0.0'}).then(()=>console.log('backend running'));
