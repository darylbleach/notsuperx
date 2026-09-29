import { initConfig } from './config.js';
import { wrapD1 } from './db.js';
import { handle } from './app.js';
import { cronTick } from './core.js';

export default {
  async fetch(req, env) {
    initConfig(env);
    const res = await handle(req, env, wrapD1(env.DB));
    if (res) return res;
    return env.ASSETS.fetch(req); // static SPA (web/)
  },
  async scheduled(event, env, ctx) {
    initConfig(env);
    ctx.waitUntil(cronTick(wrapD1(env.DB), new Date(event.scheduledTime)));
  },
};
