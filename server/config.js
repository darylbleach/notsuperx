// Runtime config. Populated from Workers env bindings (or process.env locally) via initConfig().
export const config = {
  baseUrl: 'http://localhost:8787', password: 'change-me', secret: 'dev-secret-change-me',
  xClientId: '', xApiBase: 'https://api.x.com/2', xAuthBase: 'https://x.com/i/oauth2/authorize', anthropicBase: 'https://api.anthropic.com', bskyBase: 'https://bsky.social/xrpc', xClientSecret: '', anthropicKey: '', model: 'claude-sonnet-5-5', bskyHandle: '', bskyPassword: '',
};

export function initConfig(e = {}) {
  config.baseUrl = (e.BASE_URL || config.baseUrl).replace(/\/$/, '');
  config.password = e.APP_PASSWORD || config.password;
  config.secret = e.SESSION_SECRET || config.secret;
  config.xClientId = e.X_CLIENT_ID || '';
  config.xApiBase = e.X_API_BASE || 'https://api.x.com/2';
  config.xAuthBase = e.X_AUTH_BASE || 'https://x.com/i/oauth2/authorize';
  config.anthropicBase = e.ANTHROPIC_API_BASE || 'https://api.anthropic.com';
  config.bskyBase = e.BSKY_API_BASE || 'https://bsky.social/xrpc';
  config.xClientSecret = e.X_CLIENT_SECRET || '';
  config.anthropicKey = e.ANTHROPIC_API_KEY || '';
  config.model = e.ANTHROPIC_MODEL || config.model;
  config.bskyHandle = e.BSKY_HANDLE || '';
  config.bskyPassword = e.BSKY_APP_PASSWORD || '';
}
