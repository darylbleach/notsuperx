#!/usr/bin/env node
// stdio<->HTTP MCP bridge for clients that only speak stdio (e.g. Claude Desktop).
// Config: NSX_URL, NSX_KEY.  { "command": "node", "args": ["cli/mcp-stdio.js"], "env": {...} }
import readline from 'node:readline';
const URL_ = (process.env.NSX_URL || 'http://localhost:8787').replace(/\/$/, ''), KEY = process.env.NSX_KEY || '';
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  if (!line.trim()) continue;
  let msg; try { msg = JSON.parse(line); } catch { continue; }
  try {
    const r = await fetch(URL_ + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: line });
    const out = await r.json();
    if (msg.id !== undefined && out && Object.keys(out).length) process.stdout.write(JSON.stringify(out) + '\n');
  } catch (e) { if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e.message } }) + '\n'); }
}
