// Personal preferences (settings.json section "prefs"): favourite effects,
// the playlist that cycles through them, and automatic night dimming.
'use strict';
const { readSectionJson, writeSection } = require('./settingsStore');

const DEFAULT = {
  favourites: [],
  stations: [], // favourite radio stations: [{ name, genre, url }]
  videos: [], // favourite YouTube videos: [{ id, title, channel, duration }]
  playlist: { on: false, minutes: 5 },
  nightDim: { on: false, from: 22, to: 7, level: 0.3 },
  look: { on: true, bloom: 0.65, vibrance: 0.35, smooth: 0, depth: 0.5, palette: 'auto' },
  // Automatic show (see src/autoShow.js).
  dayPlan: { on: false, starts: { morning: 6, day: 10, evening: 18, night: 23 }, effects: { morning: [], day: [], evening: [], night: [] }, brightness: { morning: null, day: null, evening: null, night: null } }, // brightness null = leave as it is
  weatherMode: { on: false },
  access: { localNoPin: true, guests: false }, // see src/access.js
  sfx: { on: true, volume: 0.6 }, // sound effects through the speaker (src/sfx.js)
  celebrations: { newYear: true, dates: [] }, // dates: [{ month, day, hour, minute, text }]
};

function clean(p) {
  const out = JSON.parse(JSON.stringify(DEFAULT));
  if (p && Array.isArray(p.favourites)) out.favourites = p.favourites.filter((k) => typeof k === 'string').slice(0, 60);
  if (p && Array.isArray(p.stations)) {
    out.stations = p.stations.filter((x) => x && typeof x.url === 'string' && /^https?:\/\//.test(x.url))
      .slice(0, 50).map((x) => ({ name: String(x.name || 'Station').slice(0, 80), genre: String(x.genre || '').slice(0, 60), url: x.url.slice(0, 500) }));
  }
  if (p && Array.isArray(p.videos)) {
    out.videos = p.videos.filter((x) => x && typeof x.id === 'string' && /^[\w-]{6,20}$/.test(x.id)).slice(0, 100)
      .map((x) => ({ id: x.id, title: String(x.title || '').slice(0, 120), channel: String(x.channel || '').slice(0, 80), duration: Number(x.duration) > 0 ? Number(x.duration) : 0 }));
  }
  if (p && p.playlist) {
    out.playlist.on = !!p.playlist.on;
    const m = Number(p.playlist.minutes);
    if (Number.isFinite(m)) out.playlist.minutes = Math.max(0.5, Math.min(120, m));
  }
  if (p && p.nightDim) {
    out.nightDim.on = !!p.nightDim.on;
    for (const k of ['from', 'to']) { const h = Number(p.nightDim[k]); if (Number.isInteger(h) && h >= 0 && h < 24) out.nightDim[k] = h; }
    const l = Number(p.nightDim.level);
    if (Number.isFinite(l)) out.nightDim.level = Math.max(0.05, Math.min(1, l));
  }
  if (p && p.look) {
    out.look.on = p.look.on !== false;
    if (typeof p.look.palette === 'string' && /^[a-z]{1,20}$/.test(p.look.palette)) out.look.palette = p.look.palette;
    for (const k of ['bloom', 'vibrance', 'smooth', 'depth']) { const v = Number(p.look[k]); if (Number.isFinite(v)) out.look[k] = Math.max(0, Math.min(1, v)); }
  }
  if (p && p.dayPlan) {
    out.dayPlan.on = !!p.dayPlan.on;
    for (const part of ['morning', 'day', 'evening', 'night']) {
      const h = Number(p.dayPlan.starts && p.dayPlan.starts[part]);
      if (Number.isInteger(h) && h >= 0 && h < 24) out.dayPlan.starts[part] = h;
      const list = p.dayPlan.effects && p.dayPlan.effects[part];
      if (Array.isArray(list)) out.dayPlan.effects[part] = list.filter((k) => typeof k === 'string' && /^[a-z0-9_]{1,30}$/.test(k)).slice(0, 20);
      const b = p.dayPlan.brightness && p.dayPlan.brightness[part];
      out.dayPlan.brightness[part] = b === null || b === undefined || b === '' || !Number.isFinite(Number(b)) ? null : Math.max(0.02, Math.min(1, Number(b)));
    }
  }
  if (p && p.weatherMode) out.weatherMode.on = !!p.weatherMode.on;
  if (p && p.sfx) { out.sfx.on = p.sfx.on !== false; const v = Number(p.sfx.volume); if (Number.isFinite(v)) out.sfx.volume = Math.max(0, Math.min(1, v)); }
  if (p && p.access) { out.access.localNoPin = p.access.localNoPin !== false; out.access.guests = !!p.access.guests; }
  if (p && p.celebrations) {
    out.celebrations.newYear = p.celebrations.newYear !== false;
    if (Array.isArray(p.celebrations.dates)) {
      out.celebrations.dates = p.celebrations.dates.map((d) => ({
        month: Number(d && d.month), day: Number(d && d.day), hour: Number(d && d.hour) || 0, minute: Number(d && d.minute) || 0,
        text: String((d && d.text) || '').slice(0, 24),
      })).filter((d) => d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31 && d.hour >= 0 && d.hour < 24 && d.minute >= 0 && d.minute < 60).slice(0, 30);
    }
  }
  return out;
}

function load() {
  try { return clean(JSON.parse(readSectionJson('prefs'))); } catch (e) { return clean(null); }
}
function save(p) { const c = clean(p); writeSection('prefs', c); return c; }

// Brightness multiplier for the current time: `level` inside the night
// window (which may wrap past midnight), easing over 30 minutes at each end.
function nightFactor(prefs, date = new Date()) {
  const n = prefs && prefs.nightDim;
  if (!n || !n.on || n.from === n.to) return 1;
  const h = date.getHours() + date.getMinutes() / 60;
  const inside = (x) => (n.from < n.to ? x >= n.from && x < n.to : x >= n.from || x < n.to);
  if (!inside(h)) {
    const until = (n.from - h + 24) % 24; // fade in over the last half hour before it starts
    return until < 0.5 ? 1 - (1 - n.level) * (1 - until / 0.5) : 1;
  }
  const left = (n.to - h + 24) % 24;
  return left < 0.5 ? n.level + (1 - n.level) * (1 - left / 0.5) : n.level;
}

module.exports = { load, save, clean, nightFactor, DEFAULT };
