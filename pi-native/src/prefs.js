// Personal preferences (settings.json section "prefs"): favourite effects,
// the playlist that cycles through them, and automatic night dimming.
'use strict';
const { readSectionJson, writeSection } = require('./settingsStore');

const DEFAULT = {
  favourites: [],
  playlist: { on: false, minutes: 5 },
  nightDim: { on: false, from: 22, to: 7, level: 0.3 },
  look: { on: true, bloom: 0.65, vibrance: 0.35, smooth: 0 },
};

function clean(p) {
  const out = JSON.parse(JSON.stringify(DEFAULT));
  if (p && Array.isArray(p.favourites)) out.favourites = p.favourites.filter((k) => typeof k === 'string').slice(0, 60);
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
    for (const k of ['bloom', 'vibrance', 'smooth']) { const v = Number(p.look[k]); if (Number.isFinite(v)) out.look[k] = Math.max(0, Math.min(1, v)); }
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
