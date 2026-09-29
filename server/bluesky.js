import { config } from './config.js';

const PDS = 'https://bsky.social/xrpc';
let session = null;

async function login() {
  if (!config.bskyHandle || !config.bskyPassword) throw new Error('Bluesky not configured');
  if (session && session.exp > Date.now()) return session;
  const r = await fetch(`${PDS}/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: config.bskyHandle, password: config.bskyPassword }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Bluesky login failed: ' + (j.message || r.status));
  session = { ...j, exp: Date.now() + 60 * 60 * 1000 };
  return session;
}

export const bskyEnabled = () => !!(config.bskyHandle && config.bskyPassword);

/** Cross-post text (thread parts chained as replies). Truncates to 300 chars. */
export async function crosspost(parts) {
  const s = await login();
  let root, parent;
  for (const text of parts) {
    const record = { $type: 'app.bsky.feed.post', text: text.slice(0, 300), createdAt: new Date().toISOString() };
    const links = [...record.text.matchAll(/https?:\/\/\S+/g)];
    if (links.length) {
      const enc = new TextEncoder();
      record.facets = links.map((m) => {
        const start = enc.encode(record.text.slice(0, m.index)).length;
        return { index: { byteStart: start, byteEnd: start + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] };
      });
    }
    if (parent) record.reply = { root, parent };
    const r = await fetch(`${PDS}/com.atproto.repo.createRecord`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.accessJwt}` },
      body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Bluesky post failed: ' + (j.message || r.status));
    const ref = { uri: j.uri, cid: j.cid };
    root ||= ref; parent = ref;
  }
  return root;
}
