// The AI assistant behind the page's Ask bar. It turns a request ("a calm
// sunset with stars", "draw a pixel cat") into a short list of actions
// the Pi already supports - pick an effect, set an option, toggle an
// overlay, brightness/speed, or draw pixel art for the AI Art effect.
// The model only ever returns data that is validated here; it can't run
// code or reach anything but these actions.
'use strict';
const { fetchWithTimeout } = require('./effects/net');
const aiConfig = require('./aiConfig');
const { EFFECT_NAMES } = require('./effects');
const { OVERLAY_KEYS } = require('./effects/overlays');

const MAX_ART = 32, MAX_FRAMES = 8;

function systemPrompt(ctx) {
  const effects = Object.entries(EFFECT_NAMES).map(([k, n]) => `${k} (${n})`).join(', ');
  return `You control an RGB LED display (${ctx.mode === 'cube' ? 'a 6-face cube' : 'flat LED panels'}, 64x64 pixels per panel).
Reply with ONLY a JSON object: {"say": "<one short friendly sentence>", "actions": [ ... ]}.
Actions (use as few as needed, max 6):
- {"type":"effect","key":"<effect key>"}  effects: ${effects}
- {"type":"overlay","key":"<overlay>","on":true|false}  overlays: ${OVERLAY_KEYS.join(', ')}
- {"type":"brightness","value":0.1-1.5}
- {"type":"speed","value":0.2-3}
- {"type":"option","effect":"<effect key>","key":"<name>","value":<string|number|boolean>}  e.g. weather city, datetime mode (time|date|both|words|analogue), radio style (glow|bars|mirror|dots|waterfall|fire)
- {"type":"palette","name":"auto|sunset|ocean|neon|ember|aurora|forest|candy|ice"}  recolour every effect (auto = its own colours)
- {"type":"off"}  blank the display
- {"type":"art","w":<4-32>,"h":<4-32>,"palette":["#rrggbb", up to 16],"frames":[[<h strings of w chars>], up to 8 frames],"fps":<1-12>}
  Pixel art drawn on the display. Each char is a palette index in hex (0-f) or "." for off. Use art when asked to draw, show a picture, icon, character, message, or something no effect covers. Keep it bold and simple; 16x16 is a good size. Animate with 2-4 frames when it helps.
Current effect: ${ctx.effect || 'none'}. Prefer existing effects when they fit the request; use art otherwise.`;
}

function extractJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('the AI did not return JSON');
  return JSON.parse(text.slice(a, b + 1));
}

// Gemini model names that worked, found by pickGeminiModel() after a 404.
const geminiWorking = { text: null, speech: null };
// Ask Google which models this key can use and pick the best match: for
// text a fast "flash" model (newest first, not image/audio/lite variants if
// avoidable); for speech a "tts" model.
async function pickGeminiModel(key, kind, failed) {
  try {
    const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }, 20000);
    if (!r.ok) return null;
    const list = ((await r.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''));
    const ok = list.filter((n) => n !== failed && (kind === 'speech' ? /tts/i.test(n) : /flash/i.test(n) && !/tts|image|audio|live|embed/i.test(n)));
    const score = (n) => (/latest/.test(n) ? 100 : 0) + (/lite/.test(n) ? -20 : 0) + (/preview|exp/.test(n) ? -5 : 0) + parseFloat((n.match(/(\d+(\.\d+)?)/) || [0, 0])[1]) * 10;
    ok.sort((a, b) => score(b) - score(a));
    return ok[0] || null;
  } catch (e) { return null; }
}

async function callProvider(cfg, system, user, opts = {}) {
  const p = aiConfig.PROVIDERS[cfg.provider];
  const model = cfg.model || p.model;
  if (p.needsKey && !cfg.key) throw new Error(`no API key set for ${p.label}`);
  let res, body;
  if (cfg.provider === 'gemini') {
    // Newer Gemini models "think" before answering, which can take longer
    // than a short reply is worth (a real report: the face sat on
    // "thinking" until it timed out) - so thinking is switched off, and the
    // request retried without that setting if a model doesn't accept it.
    let noThinking = true;
    const send = (m) => fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: opts.maxTokens || 1024, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    }, opts.timeoutMs || 45000);
    const useModel = geminiWorking.text || cfg.model || model; // a replacement found after a 404 wins
    res = await send(useModel);
    body = await res.json().catch(() => ({}));
    // Google retires model names now and then ("no longer available"): find
    // one this key can use and remember it.
    if (res.status === 404) {
      const alt = await pickGeminiModel(cfg.key, 'text', useModel);
      if (alt) { geminiWorking.text = alt; res = await send(alt); body = await res.json().catch(() => ({})); }
    }
    if (res.status === 400 && /thinking/i.test(body.error?.message || '')) { noThinking = false; res = await send(geminiWorking.text || useModel); body = await res.json().catch(() => ({})); }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message || 'request failed'}`);
    return body.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
  }
  if (cfg.provider === 'groq') {
    res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model, temperature: 0.8, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    }, 45000);
    body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Groq ${res.status}: ${body.error?.message || 'request failed'}`);
    return body.choices?.[0]?.message?.content || '';
  }
  if (cfg.provider === 'ollama') {
    const base = (cfg.url || p.url).replace(/\/+$/, '');
    res = await fetchWithTimeout(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, format: 'json', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    }, 120000);
    body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.error || 'request failed'}`);
    return body.message?.content || '';
  }
  throw new Error('AI is switched off');
}

function cleanArt(a) {
  const w = Math.max(4, Math.min(MAX_ART, Math.round(Number(a.w) || 16)));
  const h = Math.max(4, Math.min(MAX_ART, Math.round(Number(a.h) || 16)));
  const palette = (Array.isArray(a.palette) ? a.palette : []).slice(0, 16).map((c) => (/^#?[0-9a-f]{6}$/i.test(String(c)) ? '#' + String(c).replace('#', '') : '#ffffff'));
  if (!palette.length) palette.push('#ffffff');
  let frames = Array.isArray(a.frames) ? a.frames : [];
  if (frames.length && typeof frames[0] === 'string') frames = [frames]; // a single frame given as plain rows
  frames = frames.slice(0, MAX_FRAMES).filter(Array.isArray).map((f) => {
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(String(f[y] || '').toLowerCase().replace(/[^0-9a-f.]/g, '.').padEnd(w, '.').slice(0, w));
    return rows;
  });
  if (!frames.length) throw new Error('the AI art had no frames');
  return { w, h, palette, frames, fps: Math.max(1, Math.min(12, Number(a.fps) || 4)) };
}

// Validates the model's reply into actions the server can apply.
function cleanReply(reply) {
  const out = [];
  for (const a of (Array.isArray(reply.actions) ? reply.actions : []).slice(0, 6)) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'effect' && EFFECT_NAMES[a.key]) out.push({ type: 'effect', key: a.key });
    else if (a.type === 'overlay' && OVERLAY_KEYS.includes(a.key)) out.push({ type: 'overlay', key: a.key, on: !!a.on });
    else if (a.type === 'brightness' && Number.isFinite(Number(a.value))) out.push({ type: 'brightness', value: Math.max(0.1, Math.min(1.5, Number(a.value))) });
    else if (a.type === 'speed' && Number.isFinite(Number(a.value))) out.push({ type: 'speed', value: Math.max(0.2, Math.min(3, Number(a.value))) });
    else if (a.type === 'option' && EFFECT_NAMES[a.effect] && typeof a.key === 'string' && /^[a-zA-Z]{1,30}$/.test(a.key) && ['string', 'number', 'boolean'].includes(typeof a.value)) {
      out.push({ type: 'option', effect: a.effect, key: a.key, value: typeof a.value === 'string' ? a.value.slice(0, 100) : a.value });
    } else if (a.type === 'palette' && ['auto', 'sunset', 'ocean', 'neon', 'ember', 'aurora', 'forest', 'candy', 'ice'].includes(a.name)) out.push({ type: 'palette', name: a.name });
    else if (a.type === 'off') out.push({ type: 'off' });
    else if (a.type === 'art') { try { out.push({ type: 'art', art: cleanArt(a) }); } catch (e) { /* skip bad art */ } }
  }
  return { say: typeof reply.say === 'string' ? reply.say.slice(0, 200) : '', actions: out };
}

async function ask(text, ctx) {
  const cfg = aiConfig.load();
  if (cfg.provider === 'off') return { off: true };
  const raw = await callProvider(cfg, systemPrompt(ctx), String(text).slice(0, 500));
  return cleanReply(extractJson(raw));
}

// Talking Face conversation (src/faceTalk.js): a short spoken reply, with the
// last few turns for context. Returns { say } or { off: true }.
const CHAT_SYSTEM = 'You are a friendly, natural-sounding person shown as a face on an LED display in someone\'s home, chatting with them. '
  + 'Reply as you would speak: one or two short sentences, warm, a little playful, no lists, no emoji, no markdown. '
  + 'If asked to start a conversation, share a surprising fact, a light question or a comment on the time of day. '
  + 'Tell a joke now and then. Set "laugh" to "after" when your reply is a joke (you laugh at your own punchline), '
  + '"before" when the person just said something funny (you laugh first), otherwise "none". '
  + 'Answer only with JSON: {"say": "...", "laugh": "none"}';
async function chat(history, text) {
  const cfg = aiConfig.load();
  if (cfg.provider === 'off') return { off: true };
  const convo = (history || []).slice(-8).map((h) => (h.who === 'you' ? 'Person: ' : 'You: ') + h.text).join('\n');
  const raw = await callProvider(cfg, CHAT_SYSTEM, (convo ? convo + '\n' : '') + 'Person: ' + String(text).slice(0, 500), { maxTokens: 300, timeoutMs: 25000 }); // short, quick replies
  let j;
  try { j = extractJson(raw); } catch (e) { j = { say: String(raw || '') }; } // plain text is fine as a reply
  return { say: typeof j.say === 'string' ? j.say.replace(/\s+/g, ' ').trim().slice(0, 300) : '', laugh: ['before', 'after'].includes(j.laugh) ? j.laugh : 'none' };
}

// Natural speech for the Talking Face from Gemini's text-to-speech model.
// Returns 24 kHz 16-bit mono PCM, or null when Gemini isn't the AI provider
// (the face then falls back to espeak-ng).
async function speech(text, voice = 'Kore') {
  const cfg = aiConfig.load();
  if (cfg.provider !== 'gemini' || !cfg.key) return null;
  const send = (m) => fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify({ contents: [{ parts: [{ text: String(text).slice(0, 400) }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
  }, 45000);
  const tried = geminiWorking.speech || 'gemini-2.5-flash-preview-tts';
  let res = await send(tried);
  let body = await res.json().catch(() => ({}));
  if (res.status === 404) { // the speech model was retired: find the current one
    const alt = await pickGeminiModel(cfg.key, 'speech', tried);
    if (alt) { geminiWorking.speech = alt; res = await send(alt); body = await res.json().catch(() => ({})); }
  }
  if (!res.ok) throw new Error(`Gemini speech ${res.status}: ${body.error?.message || 'request failed'}`);
  const part = (body.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData && x.inlineData.data);
  if (!part) throw new Error('Gemini speech: no audio came back');
  return Buffer.from(part.inlineData.data, 'base64');
}

// The models a provider offers this key, for Setup > AI's dropdown.
// cfg: { provider, key, url }. Returns { models: [...], default }.
async function listModels(cfg) {
  const p = aiConfig.PROVIDERS[cfg.provider];
  if (!p || cfg.provider === 'off') return { models: [], default: '' };
  let names = [];
  if (cfg.provider === 'gemini') {
    if (!cfg.key) throw new Error('enter and save your Gemini key first');
    const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': cfg.key } }, 20000);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${b.error?.message || 'could not list models'}`);
    names = (b.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''))
      .filter((n) => /gemini/i.test(n) && !/tts|image|embed|aqa|live|audio/i.test(n));
    if (!names.includes(p.model)) names.unshift(p.model); // the "latest" alias isn't listed but works
  } else if (cfg.provider === 'groq') {
    if (!cfg.key) throw new Error('enter and save your Groq key first');
    const r = await fetchWithTimeout('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${cfg.key}` } }, 20000);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Groq ${r.status}: ${b.error?.message || 'could not list models'}`);
    names = (b.data || []).map((m) => m.id).filter((n) => !/whisper|tts|guard|playai/i.test(n));
  } else if (cfg.provider === 'ollama') {
    const base = (cfg.url || p.url).replace(/\/+$/, '');
    const r = await fetchWithTimeout(`${base}/api/tags`, {}, 10000);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Ollama ${r.status}: could not list models`);
    names = (b.models || []).map((m) => m.name);
  }
  // Newest-looking first, the default at the top.
  const ver = (n) => parseFloat((n.match(/(\d+(\.\d+)?)/) || [0, 0])[1]) || 0;
  names = [...new Set(names)].sort((a, b) => (b === p.model) - (a === p.model) || ver(b) - ver(a) || a.localeCompare(b));
  return { models: names.slice(0, 80), default: p.model || '' };
}

module.exports = { ask, chat, speech, listModels, cleanReply, cleanArt, extractJson, systemPrompt, pickGeminiModel, _geminiWorking: geminiWorking };
