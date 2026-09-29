CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, x_user_id TEXT UNIQUE, username TEXT, name TEXT, avatar TEXT,
  access_token TEXT, refresh_token TEXT, expires_at INTEGER,
  followers INTEGER DEFAULT 0, following INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  text TEXT NOT NULL, thread TEXT DEFAULT '[]', media TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft', scheduled_at INTEGER, posted_at INTEGER,
  x_post_id TEXT, error TEXT, bluesky INTEGER DEFAULT 0, kind TEXT DEFAULT 'post',
  created_at INTEGER DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS posts_due ON posts(status, scheduled_at);
CREATE TABLE IF NOT EXISTS slots(
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  dow INTEGER, hour INTEGER, minute INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS metrics(
  x_post_id TEXT PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  text TEXT, created_at INTEGER, type TEXT, impressions INTEGER DEFAULT 0, likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0, reposts INTEGER DEFAULT 0, quotes INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0, link_clicks INTEGER DEFAULT 0, profile_clicks INTEGER DEFAULT 0, fetched_at INTEGER);
CREATE TABLE IF NOT EXISTS follower_snaps(
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE, day TEXT, followers INTEGER, following INTEGER,
  PRIMARY KEY(account_id, day));
CREATE TABLE IF NOT EXISTS automations(
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT, config TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS auto_log(
  id INTEGER PRIMARY KEY, automation_id INTEGER, x_post_id TEXT, action TEXT, detail TEXT,
  created_at INTEGER DEFAULT (unixepoch()), UNIQUE(automation_id, x_post_id, action));
CREATE TABLE IF NOT EXISTS viral(
  id INTEGER PRIMARY KEY, x_post_id TEXT UNIQUE, author TEXT, text TEXT, likes INTEGER DEFAULT 0,
  reposts INTEGER DEFAULT 0, replies INTEGER DEFAULT 0, views INTEGER DEFAULT 0, niche TEXT DEFAULT '',
  url TEXT, source TEXT DEFAULT 'manual', saved_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS agents(
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT, query TEXT, min_followers INTEGER DEFAULT 0, auto_dm TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1, last_run INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY, agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  x_user_id TEXT, username TEXT, name TEXT, followers INTEGER, x_post_id TEXT, text TEXT,
  dm_sent INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()), UNIQUE(agent_id, x_user_id));
CREATE TABLE IF NOT EXISTS api_keys(
  id INTEGER PRIMARY KEY, name TEXT, hash TEXT UNIQUE, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS ai_usage(id INTEGER PRIMARY KEY, kind TEXT, tokens INTEGER, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS engage_targets(
  id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE, username TEXT, note TEXT DEFAULT '');
