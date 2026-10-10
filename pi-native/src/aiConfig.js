// AI assistant settings (settings.json section "ai"): which service to use
// and its key. The key never leaves the Pi: publicView() is what the page
// sees (whether a key is set, not the key itself).
'use strict';
const { readSectionJson, writeSection } = require('./settingsStore');

const PROVIDERS = {
  off: { label: 'Off (built-in keywords)' },
  gemini: { label: 'Google Gemini (free tier)', model: 'gemini-flash-latest', needsKey: true },
  groq: { label: 'Groq (free tier)', model: 'llama-3.3-70b-versatile', needsKey: true },
  ollama: { label: 'Ollama on your network', model: 'llama3.2', url: 'http://192.168.1.10:11434' },
};
const DEFAULT = { provider: 'off', key: '', model: '', url: '' };

let cached = null;
function load() {
  if (cached) return cached;
  try {
    const raw = readSectionJson('ai');
    const c = JSON.parse(raw);
    cached = { ...DEFAULT, ...c, provider: PROVIDERS[c.provider] ? c.provider : 'off' };
  } catch (e) { cached = { ...DEFAULT }; }
  return cached;
}

// Partial update; an omitted or empty key keeps the saved one unless clearKey is set.
function save(update) {
  const cur = load();
  const next = { ...cur };
  if (typeof update.provider === 'string' && PROVIDERS[update.provider]) next.provider = update.provider;
  if (typeof update.model === 'string') next.model = update.model.trim().slice(0, 80);
  if (typeof update.url === 'string') next.url = update.url.trim().slice(0, 200);
  if (typeof update.key === 'string' && update.key.trim()) next.key = update.key.trim().slice(0, 300);
  if (update.clearKey) next.key = '';
  writeSection('ai', next);
  cached = next;
  return next;
}

function publicView(c = load()) {
  const p = PROVIDERS[c.provider] || PROVIDERS.off;
  return { provider: c.provider, model: c.model || p.model || '', url: c.url || p.url || '', keySet: !!c.key, providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.label])), defaults: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.model || ''])) };
}

module.exports = { load, save, publicView, PROVIDERS };
