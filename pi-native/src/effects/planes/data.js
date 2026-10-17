// Planes overhead: live aircraft near home and where they're flying.
//   aircraft  airplanes.live (adsb.lol as a fallback) - free, no key: every
//             plane within the radius, with callsign, type, altitude,
//             speed, track and position
//   routes    adsbdb.com - callsign -> airline and the from/to airports
// Polled every few seconds (backing off on 429s); positions are carried
// forward between polls from each plane's speed and track, so they move
// smoothly. Routes are looked up one at a time and cached. Per thread.
'use strict';

const { fetchWithTimeout } = require('../net');

const POLL_MS = 8000;
const ROUTE_GAP_MS = 1500;
const KT_TO_KMS = 1.852 / 3600;

// Airline colours (a tail-fin colour) and short names, by ICAO prefix.
const AIRLINES = {
  BAW: ['British Airways', [0.15, 0.3, 1]], SHT: ['British Airways', [0.15, 0.3, 1]], CFE: ['BA CityFlyer', [0.15, 0.3, 1]],
  VIR: ['Virgin Atlantic', [1, 0.1, 0.15]], EZY: ['easyJet', [1, 0.45, 0]], EJU: ['easyJet', [1, 0.45, 0]], EZS: ['easyJet', [1, 0.45, 0]],
  RYR: ['Ryanair', [0.1, 0.3, 0.9]], RUK: ['Ryanair', [0.1, 0.3, 0.9]], DLH: ['Lufthansa', [1, 0.75, 0.05]], AFR: ['Air France', [0.1, 0.3, 1]],
  KLM: ['KLM', [0.2, 0.65, 1]], UAE: ['Emirates', [1, 0.15, 0.1]], QTR: ['Qatar Airways', [0.6, 0.1, 0.3]], ETD: ['Etihad', [0.85, 0.65, 0.3]],
  AAL: ['American', [0.7, 0.75, 0.8]], DAL: ['Delta', [0.2, 0.3, 0.9]], UAL: ['United', [0.2, 0.4, 1]], SIA: ['Singapore Airlines', [1, 0.7, 0.1]],
  TOM: ['TUI', [0.2, 0.6, 1]], EXS: ['Jet2', [1, 0.15, 0.1]], WZZ: ['Wizz Air', [0.85, 0.2, 0.6]], WUK: ['Wizz Air', [0.85, 0.2, 0.6]],
  EIN: ['Aer Lingus', [0.1, 0.75, 0.4]], IBE: ['Iberia', [1, 0.2, 0.1]], VLG: ['Vueling', [1, 0.85, 0.1]], THY: ['Turkish Airlines', [1, 0.1, 0.1]],
  SWR: ['Swiss', [1, 0.1, 0.1]], AUA: ['Austrian', [1, 0.1, 0.1]], TAP: ['TAP Air Portugal', [0.2, 0.8, 0.3]], ACA: ['Air Canada', [1, 0.1, 0.1]],
  LOG: ['Loganair', [0.2, 0.4, 1]], NOZ: ['Norwegian', [1, 0.1, 0.15]], NSZ: ['Norwegian', [1, 0.1, 0.15]], SAS: ['SAS', [0.2, 0.3, 0.9]],
  FIN: ['Finnair', [0.2, 0.4, 1]], ICE: ['Icelandair', [0.2, 0.4, 0.9]], CPA: ['Cathay Pacific', [0.1, 0.6, 0.5]], JAL: ['Japan Airlines', [1, 0.1, 0.1]],
  ANA: ['ANA', [0.2, 0.4, 1]], QFA: ['Qantas', [1, 0.1, 0.1]], FDX: ['FedEx', [0.5, 0.2, 0.8]], UPS: ['UPS', [0.6, 0.4, 0.15]],
  DHK: ['DHL', [1, 0.8, 0.1]], BCS: ['DHL', [1, 0.8, 0.1]], AEA: ['Air Europa', [0.2, 0.4, 1]], ELY: ['El Al', [0.2, 0.4, 1]],
  KAL: ['Korean Air', [0.4, 0.7, 1]], CCA: ['Air China', [1, 0.1, 0.1]], CSN: ['China Southern', [0.2, 0.5, 1]], ETH: ['Ethiopian', [0.2, 0.8, 0.3]],
  SVA: ['Saudia', [0.2, 0.6, 0.4]], PIA: ['PIA', [0.2, 0.7, 0.4]], AIC: ['Air India', [1, 0.3, 0.1]], LOT: ['LOT', [0.2, 0.4, 1]],
};
function airlineOf(cs) {
  const k = String(cs || '').slice(0, 3).toUpperCase();
  if (AIRLINES[k]) return { name: AIRLINES[k][0], color: AIRLINES[k][1], icao: k };
  let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = (h % 360) / 360, f = (n) => { const x = (n + hue * 12) % 12; return 0.55 - 0.45 * Math.max(-1, Math.min(x - 3, 9 - x, 1)); };
  return { name: '', color: [f(0), f(8), f(4)], icao: k };
}

function createPlaneData(fetchFn = fetchWithTimeout) {
  const st = { planes: [], status: 'Waiting for location', home: null, homeKey: '', geo: '', fetching: false, lastPoll: 0, backoffUntil: 0, routes: new Map(), queue: [], routeAt: 0, routeBusy: false };

  async function getJson(url) {
    const r = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (r.status === 429 || r.status === 403) { const e = new Error(`${new URL(url).hostname} ${r.status} (busy)`); e.busy = true; throw e; }
    if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
    return r.json();
  }
  async function geocode(city) {
    st.geo = city;
    try {
      const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`);
      const g = d.results && d.results[0];
      if (!g) { st.status = `Place "${city}" not found`; return; }
      st.home = { lat: g.latitude, lon: g.longitude, name: g.name };
      st.lastPoll = 0;
    } catch (e) { st.status = 'Finding ' + city + ': ' + e.message; st.geo = ''; }
  }
  // Distance (km) and bearing (deg) from home.
  function relate(lat, lon) {
    const R = 6371, toR = Math.PI / 180, h = st.home;
    const dLat = (lat - h.lat) * toR, dLon = (lon - h.lon) * toR, la1 = h.lat * toR, la2 = lat * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    const y = Math.sin(dLon) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return { dist, brg: (Math.atan2(y, x) / toR + 360) % 360 };
  }
  async function poll(opts) {
    st.fetching = true;
    const radiusKm = [5, 10, 20, 40, 80].includes(Number(opts.radiusKm)) ? Number(opts.radiusKm) : 20;
    const nm = Math.max(1, Math.round(radiusKm / 1.852)), maxAlt = Number(opts.maxAltFt) > 0 ? Number(opts.maxAltFt) : 60000;
    const { lat, lon } = st.home;
    let d = null, err = null;
    for (const host of ['https://api.airplanes.live/v2/point', 'https://api.adsb.lol/v2/point']) {
      try { d = await getJson(`${host}/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`); break; } catch (e) { err = e; }
    }
    st.fetching = false; st.lastPoll = Date.now();
    if (!d) { st.status = err ? err.message : 'no data'; if (err && err.busy) st.backoffUntil = Date.now() + 60000; return; }
    const now = Date.now(), prev = new Map(st.planes.map((p) => [p.hex, p]));
    const list = [];
    for (const a of d.ac || d.aircraft || []) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      const alt = a.alt_baro === 'ground' ? 0 : Number(a.alt_baro || a.alt_geom || 0);
      if (!(alt > 0) || alt > maxAlt) continue;
      const cs = String(a.flight || '').trim().toUpperCase();
      const p = { hex: a.hex, cs, type: String(a.t || '').toUpperCase(), reg: String(a.r || ''), alt, gs: Number(a.gs) || 0, track: Number(a.track) || 0, lat: a.lat, lon: a.lon, fix: now - (Number(a.seen_pos) || 0) * 1000, vr: Number(a.baro_rate) || 0 };
      p.firstSeen = prev.has(p.hex) ? prev.get(p.hex).firstSeen : now;
      const r = relate(p.lat, p.lon); if (r.dist > radiusKm * 1.15) continue;
      list.push(p);
      if (cs && !st.routes.has(cs) && !st.queue.includes(cs)) st.queue.push(cs);
    }
    st.planes = list;
    st.status = list.length ? `${list.length} plane${list.length === 1 ? '' : 's'} within ${radiusKm} km` : `No planes within ${radiusKm} km`;
  }
  async function lookupRoute(cs) {
    st.routeBusy = true;
    try {
      const d = await getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`);
      const fr = d && d.response && d.response.flightroute;
      if (!fr) st.routes.set(cs, null);
      else {
        const ap = (x) => (x ? { iata: x.iata_code || x.icao_code || '', city: x.municipality || x.name || '' } : null);
        st.routes.set(cs, { airline: fr.airline ? fr.airline.name : '', from: ap(fr.origin), to: ap(fr.destination) });
      }
    } catch (e) {
      if (/ 404/.test(e.message) || /unknown/i.test(e.message)) st.routes.set(cs, null);
      else st.queue.push(cs); // try again later
    }
    st.routeBusy = false; st.routeAt = Date.now();
  }

  // Call every frame with the effect's options.
  function update(opts = {}) {
    const now = Date.now();
    const lat = Number(opts.lat), lon = Number(opts.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) {
      const key = lat.toFixed(4) + ',' + lon.toFixed(4);
      if (key !== st.homeKey) { st.homeKey = key; st.home = { lat, lon, name: '' }; st.lastPoll = 0; }
    } else if (opts.city && st.geo !== opts.city) { st.homeKey = ''; geocode(String(opts.city)); }
    if (!st.home) { if (!opts.city) st.status = 'Set your location in the options'; return; }
    if (!st.fetching && now >= st.backoffUntil && now - st.lastPoll >= POLL_MS) poll(opts).catch((e) => { st.fetching = false; st.status = e.message; });
    if (!st.routeBusy && st.queue.length && now - st.routeAt >= ROUTE_GAP_MS) lookupRoute(st.queue.shift());
  }

  // The planes now, nearest first, moved on from their last fix.
  function planes() {
    if (!st.home) return [];
    const now = Date.now();
    return st.planes.map((p) => {
      const dt = Math.min(25, Math.max(0, (now - p.fix) / 1000)), km = p.gs * KT_TO_KMS * dt, tr = p.track * Math.PI / 180;
      const lat = p.lat + (km * Math.cos(tr)) / 111.2, lon = p.lon + (km * Math.sin(tr)) / (111.2 * Math.cos(p.lat * Math.PI / 180) || 1);
      const rel = relate(lat, lon), route = st.routes.get(p.cs), al = airlineOf(p.cs);
      return { ...p, lat, lon, dist: rel.dist, brg: rel.brg, route: route || null, airline: (route && route.airline) || al.name, color: al.color };
    }).sort((a, b) => a.dist - b.dist);
  }
  return { update, planes, status: () => st.status, state: st };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];

module.exports = { createPlaneData, airlineOf, compass, AIRLINES };
