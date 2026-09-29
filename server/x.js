import { config } from './config.js';

export const SCOPES = 'tweet.read tweet.write tweet.moderate.write users.read follows.read like.read like.write offline.access dm.read dm.write media.write bookmark.read';

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function pkcePair() {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64u(digest) };
}

export function authUrl(state, challenge) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: config.xClientId,
    redirect_uri: `${config.baseUrl}/auth/x/callback`, scope: SCOPES,
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `${config.xAuthBase}?${q}`;
}

function basicHeader() {
  return config.xClientSecret
    ? { Authorization: 'Basic ' + btoa(`${config.xClientId}:${config.xClientSecret}`) }
    : {};
}

async function tokenRequest(params) {
  const r = await fetch(`${config.xApiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...basicHeader() },
    body: new URLSearchParams({ client_id: config.xClientId, ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`X token error: ${JSON.stringify(j)}`);
  return j;
}

export const exchangeCode = (code, verifier) =>
  tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: `${config.baseUrl}/auth/x/callback` });

/** X API client bound to one DB account row; auto-refreshes tokens. */
export class XClient {
  constructor(db, account) { this.db = db; this.acc = account; }

  async token() {
    const a = this.acc;
    if (a.expires_at && a.expires_at - 60 > Date.now() / 1000) return a.access_token;
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refresh_token });
    a.access_token = t.access_token;
    a.refresh_token = t.refresh_token || a.refresh_token;
    a.expires_at = Math.floor(Date.now() / 1000) + (t.expires_in || 7200);
    await this.db.run('UPDATE accounts SET access_token=?, refresh_token=?, expires_at=? WHERE id=?',
      a.access_token, a.refresh_token, a.expires_at, a.id);
    return a.access_token;
  }

  async req(method, path, { query, body, form } = {}) {
    const url = new URL(config.xApiBase + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    const headers = { Authorization: `Bearer ${await this.token()}` };
    let payload;
    if (form) payload = form;
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(url, { method, headers, body: payload });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) {
      const err = new Error(`X ${method} ${path} ${r.status}: ${j.detail || j.title || text.slice(0, 200)}`);
      err.status = r.status; err.body = j;
      throw err;
    }
    return j;
  }

  me() {
    return this.req('GET', '/users/me', { query: { 'user.fields': 'public_metrics,profile_image_url,name,username' } });
  }

  async uploadMedia(buffer, mime) {
    const form = new FormData();
    form.set('media', new Blob([buffer], { type: mime }), 'upload');
    form.set('media_category', mime.startsWith('video') ? 'tweet_video' : mime === 'image/gif' ? 'tweet_gif' : 'tweet_image');
    const j = await this.req('POST', '/media/upload', { form });
    return j.data?.id || j.media_id_string;
  }

  createPost({ text, replyTo, mediaIds, quote }) {
    const body = { text };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
    if (mediaIds?.length) body.media = { media_ids: mediaIds };
    if (quote) body.quote_tweet_id = quote;
    return this.req('POST', '/tweets', { body });
  }

  /** Post a thread; returns array of X post ids. */
  async postThread(parts, mediaIds = []) {
    const ids = [];
    for (let i = 0; i < parts.length; i++) {
      const r = await this.createPost({ text: parts[i], replyTo: ids[i - 1], mediaIds: i === 0 ? mediaIds : undefined });
      ids.push(r.data.id);
    }
    return ids;
  }

  deletePost(id) { return this.req('DELETE', `/tweets/${id}`); }
  repost(id) { return this.req('POST', `/users/${this.acc.x_user_id}/retweets`, { body: { tweet_id: id } }); }
  unrepost(id) { return this.req('DELETE', `/users/${this.acc.x_user_id}/retweets/${id}`); }
  like(id) { return this.req('POST', `/users/${this.acc.x_user_id}/likes`, { body: { tweet_id: id } }); }
  sendDm(userId, text) { return this.req('POST', `/dm_conversations/with/${userId}/messages`, { body: { text } }); }

  timeline({ max = 100, sinceId, page } = {}) {
    return this.req('GET', `/users/${this.acc.x_user_id}/tweets`, {
      query: {
        max_results: Math.min(max, 100), since_id: sinceId, pagination_token: page,
        'tweet.fields': 'created_at,public_metrics,non_public_metrics,referenced_tweets,attachments,entities',
        exclude: 'retweets',
      },
    });
  }

  mentions(max = 50) {
    return this.req('GET', `/users/${this.acc.x_user_id}/mentions`, {
      query: {
        max_results: max, expansions: 'author_id', 'tweet.fields': 'created_at,public_metrics,conversation_id,referenced_tweets',
        'user.fields': 'username,name,profile_image_url,public_metrics',
      },
    });
  }

  search(query, max = 50) {
    return this.req('GET', '/tweets/search/recent', {
      query: {
        query, max_results: Math.min(Math.max(max, 10), 100), expansions: 'author_id',
        'tweet.fields': 'created_at,public_metrics,lang', 'user.fields': 'username,name,public_metrics,description',
      },
    });
  }

  userByUsername(u) {
    return this.req('GET', `/users/by/username/${u}`, { query: { 'user.fields': 'public_metrics,profile_image_url,description,created_at' } });
  }

  userTweets(userId, max = 20, { replies = false } = {}) {
    return this.req('GET', `/users/${userId}/tweets`, {
      query: { max_results: Math.min(Math.max(max, 5), 100), exclude: replies ? 'retweets' : 'retweets,replies', 'tweet.fields': 'created_at,public_metrics,referenced_tweets,attachments,entities' },
    });
  }

  trends(woeid = 1) {
    return this.req('GET', `/trends/by/woeid/${woeid}`, { query: { max_trends: 30 } });
  }

  getPostFull(id) {
    return this.req('GET', `/tweets/${id}`, {
      query: { expansions: 'attachments.media_keys,author_id', 'media.fields': 'type,url,variants,preview_image_url', 'tweet.fields': 'text,created_at,public_metrics', 'user.fields': 'username,name,profile_image_url' },
    });
  }

  getPost(id) {
    return this.req('GET', `/tweets/${id}`, { query: { 'tweet.fields': 'created_at,public_metrics,author_id', expansions: 'author_id', 'user.fields': 'username' } });
  }
}

export function classify(t) {
  const refs = t.referenced_tweets || [];
  if (refs.some((r) => r.type === 'replied_to')) return 'reply';
  if (refs.some((r) => r.type === 'quoted')) return 'quote';
  if (t.attachments?.media_keys?.length) return 'media';
  if (t.entities?.urls?.some((u) => !u.expanded_url?.includes('x.com') && !u.expanded_url?.includes('twitter.com'))) return 'link';
  return 'text';
}
