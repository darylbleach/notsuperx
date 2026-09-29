import { config } from './config.js';

export async function claude(db, { system, prompt, max = 1500, kind = 'ai', temperature = 0.9 }) {
  if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
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

  bio: async (db, { about, count = 5 }) =>
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
};
