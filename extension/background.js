// Proxies API calls from the x.com content script to your NotSuperX server (avoids CORS).
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  (async () => {
    const { server, key } = await chrome.storage.sync.get(['server', 'key']);
    if (!server || !key) return send({ error: 'Open the extension options and set server URL + API key.' });
    try {
      const r = await fetch(server.replace(/\/$/, '') + '/api' + msg.path, {
        method: msg.method || 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: msg.body ? JSON.stringify(msg.body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      send(r.ok ? j : { error: j.error || r.statusText });
    } catch (e) { send({ error: e.message }); }
  })();
  return true;
});
