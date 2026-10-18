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

// Interesting aircraft: giants, classics, military.
const INTERESTING_TYPES = new Set(['A388', 'B748', 'B744', 'B742', 'B741', 'A124', 'A225', 'AN22', 'A3ST', 'A337', 'BLCF', 'C17', 'C130', 'C30J', 'A400', 'E3TF', 'E3CF', 'K35R', 'KC2', 'A332K', 'A33K', 'B52', 'B1', 'B2', 'F35', 'EUFI', 'F15', 'F16', 'F18', 'TOR', 'HAWK', 'U2', 'P8', 'RC135', 'R135', 'E6', 'VC25', 'CONC', 'DC3', 'DC6', 'SPIT', 'HURI', 'LANC', 'B17', 'C5', 'C5M', 'IL76', 'TU95', 'A346', 'B77L', 'MD11', 'DC10', 'L101']);
const MIL_CS = /^(RRR|ASCOT|RCH|REACH|CFC|NATO|TARTN|KITTY|COMET|DUKE|HKY|BAF|GAF|IAM|FAF|SHF|NAVY|ARMY|CNV|SAM|PAT|RFR|QID|MMF|NOH|IFC)/;
const isInteresting = (p) => p.mil || INTERESTING_TYPES.has(p.type);

function createPlaneData(fetchFn = fetchWithTimeout) {
  const st = { dueAt: new Map(), day: null, planes: [], status: 'Waiting for location', home: null, homeKey: '', geo: '', fetching: false, lastPoll: 0, backoffUntil: 0, routes: new Map(), queue: [], routeAt: 0, routeBusy: false };

  // These services refuse requests that don't say who's asking.
  const HEADERS = { Accept: 'application/json', 'User-Agent': 'Multidisplay-LED/1.0 (home LED display; github.com/chaoticatom/Multidisplay)' };
  async function getJson(url) {
    const host = new URL(url).hostname;
    let r;
    try { r = await fetchFn(url, { headers: HEADERS }); } catch (e) { const c = e.cause && (e.cause.code || e.cause.message); throw new Error(`${host}: ${c || e.message}`); }
    if (r.status === 429) { const e = new Error(`${host} 429 (busy)`); e.busy = true; throw e; }
    if (!r.ok) throw new Error(`${host} ${r.status}${r.status === 403 ? ' (refused)' : ''}`);
    return r.json();
  }
  // OpenSky (the last resort): rows of [icao24, callsign, country, ..., lon, lat, baro_alt_m, on_ground, velocity_ms, track, vrate, ...].
  const fromOpenSky = (d) => ({ ac: (d.states || []).map((s) => ({ hex: s[0], flight: s[1], lon: s[5], lat: s[6], alt_baro: s[8] ? 'ground' : (s[7] || 0) * 3.281, gs: (s[9] || 0) * 1.944, track: s[10] || 0, baro_rate: (s[11] || 0) * 196.9 })) });
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
    const errs = [];
    const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);
    const SOURCES = [
      [`https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`, (x) => x],
      [`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`, (x) => x],
      [`https://api.adsb.one/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`, (x) => x],
      [`https://opensky-network.org/api/states/all?lamin=${(lat - dLat).toFixed(3)}&lomin=${(lon - dLon).toFixed(3)}&lamax=${(lat + dLat).toFixed(3)}&lomax=${(lon + dLon).toFixed(3)}`, fromOpenSky],
    ];
    // Start with the one that worked last time.
    const order = SOURCES.map((_, i) => (i + (st.srcOk || 0)) % SOURCES.length);
    for (const i of order) {
      try { d = SOURCES[i][1](await getJson(SOURCES[i][0])); st.srcOk = i; st.source = new URL(SOURCES[i][0]).hostname; break; } catch (e) { err = e; errs.push(e.message); }
    }
    if (!d && errs.length) err = new Error('No plane data - ' + errs.join('; '));
    st.fetching = false; st.lastPoll = Date.now();
    if (!d) { st.status = err ? err.message : 'no data'; if (err && err.busy) st.backoffUntil = Date.now() + 60000; return; }
    const now = Date.now(), prev = new Map(st.planes.map((p) => [p.hex, p]));
    const list = [];
    for (const a of d.ac || d.aircraft || []) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      const alt = a.alt_baro === 'ground' ? 0 : Number(a.alt_baro || a.alt_geom || 0);
      if (!(alt > 0) || alt > maxAlt) continue;
      const cs = String(a.flight || '').trim().toUpperCase();
      const p = { mil: (Number(a.dbFlags) & 1) === 1 || MIL_CS.test(cs), hex: a.hex, cs, type: String(a.t || '').toUpperCase(), reg: String(a.r || ''), alt, gs: Number(a.gs) || 0, track: Number(a.track) || 0, lat: a.lat, lon: a.lon, fix: now - (Number(a.seen_pos) || 0) * 1000, vr: Number(a.baro_rate) || 0 };
      p.firstSeen = prev.has(p.hex) ? prev.get(p.hex).firstSeen : now;
      const r = relate(p.lat, p.lon); if (r.dist > radiusKm * 1.15) continue;
      if (opts.only === 'interesting' && !isInteresting(p)) continue;
      list.push(p);
      tally(p);
      if (cs && !st.routes.has(cs) && !st.queue.includes(cs)) st.queue.push(cs);
    }
    st.planes = list;
    st.status = list.length ? `${list.length} plane${list.length === 1 ? '' : 's'} within ${radiusKm} km` : `No planes within ${radiusKm} km`;
  }
  // Today's tally (since midnight): planes seen, busiest airline, highest,
  // fastest, interesting ones.
  function tally(p) {
    const date = new Date().toDateString();
    if (!st.day || st.day.date !== date) st.day = { date, seen: new Set(), airlines: new Map(), highest: null, fastest: null, interesting: [] };
    const d = st.day;
    if (!d.seen.has(p.hex)) {
      d.seen.add(p.hex);
      const al = airlineOf(p.cs).name; if (al) d.airlines.set(al, (d.airlines.get(al) || 0) + 1);
      if (isInteresting(p) && d.interesting.length < 20) d.interesting.push((p.type || '') + (p.cs ? ' ' + p.cs : ''));
    }
    if (!d.highest || p.alt > d.highest.alt) d.highest = { cs: p.cs || p.hex, alt: p.alt };
    if (!d.fastest || p.gs > d.fastest.gs) d.fastest = { cs: p.cs || p.hex, gs: p.gs };
  }
  // Does a route make sense for a plane here? Charter and business flights
  // reuse flight numbers, so a lookup can return an old trip on the other
  // side of the world: the plane must be near the line between the two
  // airports (within ~300 km of it, and not far beyond either end).
  function routeFits(route, lat, lon) {
    const a = route.from, b = route.to;
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lon)) return true; // can't tell: keep it
    const k = Math.cos(lat * Math.PI / 180) * 111.2, P = (la, lo) => [(lo - lon) * k, (la - lat) * 111.2];
    const [ax, ay] = P(a.lat, a.lon), [bx, by] = P(b.lat, b.lon), vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const tt = (-(ax) * vx - (ay) * vy) / l2, cx = ax + vx * Math.max(0, Math.min(1, tt)), cy = ay + vy * Math.max(0, Math.min(1, tt));
    return Math.hypot(cx, cy) < 300; // km from the plane to the route line
  }
  function summary() {
    const d = st.day; if (!d) return null;
    let busy = null; for (const [k, v] of d.airlines) if (!busy || v > busy.n) busy = { name: k, n: v };
    return { count: d.seen.size, busiest: busy, highest: d.highest, fastest: d.fastest, interesting: d.interesting.slice(-5) };
  }
  async function lookupRoute(cs) {
    st.routeBusy = true;
    try {
      const d = await getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`);
      const fr = d && d.response && d.response.flightroute;
      if (!fr) st.routes.set(cs, null);
      else {
        const ap = (x) => (x ? { iata: x.iata_code || x.icao_code || '', city: x.municipality || x.name || '', lat: Number(x.latitude), lon: Number(x.longitude) } : null);
        const from = ap(fr.origin), to = ap(fr.destination);
        // A route that starts and ends at the same airport is a bad record: only the airline is kept.
        const ok = from && to && from.iata && to.iata && from.iata !== to.iata;
        st.routes.set(cs, { airline: fr.airline ? fr.airline.name : '', from: ok ? from : null, to: ok ? to : null });
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
      const rel = relate(lat, lon), r0 = st.routes.get(p.cs), route = r0 && r0.from && !routeFits(r0, lat, lon) ? { airline: r0.airline, from: null, to: null } : r0, al = airlineOf(p.cs);
      // Will it pass over home? Its closest approach on its present track.
      const b = rel.brg * Math.PI / 180, e = rel.dist * Math.sin(b), nn = rel.dist * Math.cos(b), v = p.gs * KT_TO_KMS;
      const ve = v * Math.sin(tr), vn = v * Math.cos(tr), vv = ve * ve + vn * vn;
      const tc = vv > 1e-9 ? -(e * ve + nn * vn) / vv : 0, miss = Math.hypot(e + ve * tc, nn + vn * tc);
      let dueIn = tc > 0 && tc < 900 && miss < 2.5 ? tc : -1;
      // A steady countdown: held as a clock time, nudged towards each new
      // estimate (positions arrive every few seconds and jitter).
      if (dueIn >= 0) {
        const est = now + dueIn * 1000, had = st.dueAt.get(p.hex);
        const at = had && Math.abs(had - est) < 15000 ? had + (est - had) * 0.05 : est;
        st.dueAt.set(p.hex, at); dueIn = Math.max(0, (at - now) / 1000);
      } else st.dueAt.delete(p.hex);
      return { ...p, lat, lon, dist: rel.dist, brg: rel.brg, dueIn, miss, overhead: rel.dist < 1.5, route: route || null, airline: (route && route.airline) || al.name, color: al.color, interesting: isInteresting(p) };
    }).sort((a, b) => a.dist - b.dist);
  }
  return { update, planes, summary, status: () => st.status, state: st };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];

module.exports = { createPlaneData, airlineOf, compass, isInteresting, AIRLINES };
