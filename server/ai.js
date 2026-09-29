import { config } from './config.js';

export async function claude(db, { system, prompt, max = 1500, kind = 'ai', temperature = 0.9 }) {
  if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch(`${config.anthropicBase}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, max_tokens: max, temperature, system, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j.error?.message || JSON.stringify(j)}`);
  const tokens = (j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0);
  await db?.run('INSERT INTO ai_usage(kind,tokens) VALUES(?,?)', kind, tokens);
  return j.content.map((c) => c.text || '').join('').trim();
}

const RULES = `You write for X (Twitter). Rules: no hashtags unless asked, no emojis unless the voice uses them, no "Here's" preambles, no em-dash overuse, concrete over vague, short lines, strong first line hook. Each post <= 280 chars unless it is an X Article. Output only what is asked.`;

const voiceBlock = (voice) => voice ? `\nWrite in this author's voice. Voice notes and sample posts:\n${voice}\n` : '';

const parseList = (txt) => {
  try { const m = txt.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); } catch {}
  return txt.split(/\n{2,}|\n---\n/).map((s) => s.trim()).filter(Boolean);
};

export const ai = {
  posts: async (db, { topic, voice, count = 5, tone }) =>
    parseList(await claude(db, {
      kind: 'posts', system: RULES + voiceBlock(voice),
      prompt: `Write ${count} distinct standalone X posts about: ${topic}.${tone ? ` Tone: ${tone}.` : ''} Return ONLY a JSON array of strings.`,
    })),

  thread: async (db, { topic, voice, length = 7 }) =>
    parseList(await claude(db, {
      kind: 'thread', max: 3000, system: RULES + voiceBlock(voice),
      prompt: `Write an X thread of ${length} posts about: ${topic}. Post 1 is a strong hook. Last post is a CTA/summary. Do not number posts. Return ONLY a JSON array of strings.`,
    })),

  rewrite: async (db, { text, voice, tone, count = 3 }) =>
    parseList(await claude(db, {
      kind: 'rewrite', system: RULES + voiceBlock(voice),
      prompt: `Rewrite this post ${count} different ways${tone ? ` in a ${tone} tone` : ''}, keeping the core idea:\n\n${text}\n\nReturn ONLY a JSON array of strings.`,
    })),

  replies: async (db, { text, author, voice, count = 3 }) =>
    parseList(await claude(db, {
      kind: 'reply', max: 800, system: RULES + voiceBlock(voice),
      prompt: `Suggest ${count} reply options to this post by @${author || 'someone'}. Add value, no flattery, no generic praise. <=200 chars each.\n\nPOST: ${text}\n\nReturn ONLY a JSON array of strings.`,
    })),

  fromTrend: async (db, { trend, voice, niche }) =>
    parseList(await claude(db, {
      kind: 'trend', system: RULES + voiceBlock(voice),
      prompt: `Trend/topic: "${trend}". Niche: ${niche || 'general'}. Write 4 posts that ride this trend credibly for this niche. Return ONLY a JSON array of strings.`,
    })),

  readyToPost: async (db, { niche, voice, viral = [], count = 5 }) =>
    parseList(await claude(db, {
      kind: 'ready', max: 2000, system: RULES + voiceBlock(voice),
      prompt: `Niche: ${niche}. Using the structure/hook patterns (NOT the wording) of these proven posts, write ${count} fresh original posts:\n\n${viral.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n\nReturn ONLY a JSON array of strings.`,
    })),

  article: (db, { topic, voice, outline }) =>
    claude(db, {
      kind: 'article', max: 6000, system: `You write long-form X Articles in markdown. Title as # heading, then sections with ## headings. No fluff.` + voiceBlock(voice),
      prompt: `Write an X Article about: ${topic}.${outline ? `\nOutline:\n${outline}` : ''}`,
    }),

  articleCover: (db, { title }) =>
    claude(db, {
      kind: 'cover', max: 1500, temperature: 0.7,
      system: 'You output only a single self-contained SVG (1500x500 viewBox) — bold typographic cover art with the title, a modern gradient, no external assets.',
      prompt: `Cover for X Article titled: ${title}`,
    }),

  dm: (db, { lead, template, voice }) =>
    claude(db, {
      kind: 'dm', max: 400, system: RULES + voiceBlock(voice),
      prompt: `Personalize this DM template for the recipient. Keep it human, <=300 chars, no hard pitch.\nTemplate: ${template}\nRecipient: ${JSON.stringify(lead)}`,
    }),

  audit: (db, { profile, topPosts, stats }) =>
    claude(db, {
      kind: 'audit', max: 2000,
      system: 'You are a blunt X growth strategist. Give a profile audit: bio critique, content-mix critique, 5 specific actions. Markdown, concise.',
      prompt: `Profile: ${JSON.stringify(profile)}\nTop posts: ${JSON.stringify(topPosts)}\nStats: ${JSON.stringify(stats)}`,
    }),

  bio: async (db, { about, count = 8 }) =>
    parseList(await claude(db, {
      kind: 'bio', max: 800, system: 'Write X bios, <=160 chars each. Return ONLY a JSON array of strings.',
      prompt: `Write ${count} bios for: ${about}`,
    })),

  roadmap: (db, { goal, followers }) =>
    claude(db, {
      kind: 'roadmap', max: 2500, system: 'You produce a 30-day X growth roadmap in markdown: weekly themes, daily post types, engagement routine.',
      prompt: `Goal: ${goal}. Current followers: ${followers ?? 'unknown'}.`,
    }),

  chat: (db, { messages, voice }) =>
    claude(db, { kind: 'chat', system: RULES + voiceBlock(voice), prompt: messages.map((m) => `${m.role}: ${m.content}`).join('\n') }),

  factCheck: (db, { text }) =>
    claude(db, {
      kind: 'factcheck', max: 900, temperature: 0.2,
      system: 'You fact-check X posts. Output markdown: Verdict (True / Mostly true / Misleading / False / Unverifiable), the checkable claims, what is known, and what to verify. Say clearly when you cannot verify recent events. Never invent sources.',
      prompt: text,
    }),

  profileChat: (db, { profile, posts, question }) =>
    claude(db, {
      kind: 'profilechat', max: 1000, temperature: 0.4,
      system: 'You answer questions about an X profile using ONLY the supplied profile data and recent posts. Be concrete and brief.',
      prompt: `PROFILE: ${JSON.stringify(profile)}\nRECENT POSTS: ${JSON.stringify(posts)}\nQUESTION: ${question || 'Summarize this account.'}`,
    }),

  roast: (db, { posts }) =>
    claude(db, {
      kind: 'roast', max: 1500, temperature: 0.9,
      system: 'You roast an X account, funny but useful. Score each of up to 40 posts 0-10 on reading value, list the 3 worst and 3 best with a one-line reason each, then an overall score and one sentence of advice. Markdown.',
      prompt: posts.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    }),

  doomscroll: async (db, { posts, niche }) => {
    const txt = await claude(db, {
      kind: 'doomscroll', max: 1500, temperature: 0.2,
      system: 'Classify each post as Read, Pass or Not Sure for someone interested in the niche. Return ONLY a JSON array of {"i":number,"verdict":"Read|Pass|Not Sure","why":string}.',
      prompt: `Niche: ${niche}\n` + posts.map((p, i) => `${i}. ${p}`).join('\n'),
    });
    try { return JSON.parse(txt.match(/\[[\s\S]*\]/)[0]); } catch { return []; }
  },

  write: async (db, { kind = 'text', topic, length = 'medium', voice }) => {
    const spec = { tweets: 'Write 3 ready-to-post tweets. Return ONLY a JSON array of strings.', text: 'Write clear, readable text. No filler.', paragraph: 'Write one focused paragraph. No filler.', content: 'Write a post/caption/copy piece.', story: 'Write a short story with a complete narrative arc.', writer: 'Write naturally and clearly.' }[kind] || 'Write clearly.';
    const len = { short: 'Keep it short.', medium: 'Medium length.', long: 'Long and thorough.' }[length] || '';
    const out = await claude(db, { kind: 'write-' + kind, max: length === 'long' ? 3500 : 1500, system: RULES.replace('<= 280 chars unless it is an X Article', 'length as instructed') + voiceBlock(voice), prompt: `${spec} ${len}\nTopic: ${topic}` });
    return kind === 'tweets' ? parseList(out) : out;
  },
};
