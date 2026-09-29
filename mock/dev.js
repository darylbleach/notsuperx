// One command dev environment with dummy X/AI/Bluesky data: npm run dev:mock  -> http://localhost:8787 (password: pw)
import { startMock } from './mock-x.js';
const MP = 9000; await startMock(MP);
Object.assign(process.env, {
  APP_PASSWORD: process.env.APP_PASSWORD || 'pw', PORT: process.env.PORT || '8787', DB_PATH: process.env.DB_PATH || './data/mock.db',
  X_CLIENT_ID: 'mock', X_CLIENT_SECRET: 'mock', X_API_BASE: `http://localhost:${MP}/2`, X_AUTH_BASE: `http://localhost:${MP}/authorize`,
  ANTHROPIC_API_KEY: 'mock', ANTHROPIC_API_BASE: `http://localhost:${MP}`, BSKY_HANDLE: 'mock', BSKY_APP_PASSWORD: 'mock', BSKY_API_BASE: `http://localhost:${MP}/xrpc`,
});
console.log('MOCK MODE — dummy X data. Sign in with password "pw", then Settings → Connect X account.');
await import('../server/node.js');
