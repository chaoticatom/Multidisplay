'use strict';
// Planes Overhead: the data (aircraft + routes, faked) and the three looks
// on every panel layout up to six, a single panel and the cube.
const assert = require('assert');
const { createPlaneData, airlineOf } = require('../src/effects/planes/data');
const effect = require('../src/effects/planes');
const { CubeCore } = require('../src/core');

const AC = { ac: [
  { hex: 'abc123', flight: 'VIR15   ', t: 'B789', r: 'G-VNEW', alt_baro: 38000, gs: 490, track: 270, lat: 51.47, lon: -0.40, seen_pos: 1 },
  { hex: 'def456', flight: 'BAW283', t: 'A35K', alt_baro: 12000, gs: 300, track: 90, lat: 51.50, lon: -0.30 },
  { hex: 'ggg000', flight: 'EZY12', t: 'A320', alt_baro: 'ground', lat: 51.47, lon: -0.45 }, // on the ground: left out
] };
const ROUTE = { response: { flightroute: { airline: { name: 'Virgin Atlantic' }, origin: { iata_code: 'LHR', municipality: 'London' }, destination: { iata_code: 'MCO', municipality: 'Orlando' } } } };
const fakeFetch = (url) => Promise.resolve({ ok: true, status: 200, json: async () => (/adsbdb/.test(url) ? (/VIR15/.test(url) ? ROUTE : { response: 'unknown callsign' }) : AC) });

(async () => {
  try {
    // Data: planes near home, nearest first, on-ground left out, routes looked up.
    const d = createPlaneData(fakeFetch);
    d.update({ lat: 51.47, lon: -0.45, radiusKm: 20 });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    let ps = d.planes();
    assert.strictEqual(ps.length, 2, 'two airborne planes');
    assert.ok(ps[0].dist <= ps[1].dist, 'nearest first');
    d.state.routeAt = 0; d.update({ lat: 51.47, lon: -0.45, radiusKm: 20 });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    d.state.routeAt = 0; d.update({ lat: 51.47, lon: -0.45, radiusKm: 20 });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    ps = d.planes();
    const vir = ps.find((p) => p.cs === 'VIR15');
    assert.ok(vir.route && vir.route.from.iata === 'LHR' && vir.route.to.city === 'Orlando' && vir.airline === 'Virgin Atlantic', 'route looked up');
    assert.ok(airlineOf('BAW283').name === 'British Airways' && airlineOf('BAW283').color[2] > 0.8, 'airline colour table');
    // Due overhead: 10 km west, heading east at 300 kt -> over home in about 65 s.
    const westward = { ac: [{ hex: 'due001', flight: 'EZY99', t: 'A320', alt_baro: 9000, gs: 300, track: 90, lat: 51.47, lon: -0.45 - 10 / (111.2 * Math.cos(51.47 * Math.PI / 180)) }, { hex: 'big001', flight: 'BAW1', t: 'A388', alt_baro: 30000, gs: 450, track: 0, lat: 51.40, lon: -0.45 }] };
    const d2 = createPlaneData((url) => Promise.resolve({ ok: true, status: 200, json: async () => (/adsbdb/.test(url) ? { response: 'unknown callsign' } : westward) }));
    d2.update({ lat: 51.47, lon: -0.45 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    const due = d2.planes().find((p) => p.cs === 'EZY99');
    assert.ok(due.dueIn > 55 && due.dueIn < 75 && due.miss < 0.5, 'due overhead in about a minute: ' + due.dueIn + ' s, miss ' + due.miss);
    const d3 = createPlaneData((url) => Promise.resolve({ ok: true, status: 200, json: async () => (/adsbdb/.test(url) ? { response: 'unknown callsign' } : westward) }));
    d3.update({ lat: 51.47, lon: -0.45, only: 'interesting' }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    assert.deepStrictEqual(d3.planes().map((p) => p.type), ['A388'], 'interesting only: the A380');
    assert.ok(d2.summary().count === 2 && d2.summary().highest.cs === 'BAW1', 'today\'s tally');
    // Every source failing: the reason is shown, not just 'fetch failed'.
    const d4 = createPlaneData(() => Promise.reject(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })));
    d4.update({ lat: 1, lon: 1 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    assert.ok(/ENOTFOUND/.test(d4.status()), d4.status());
    // A route with the same airport at both ends is ignored (bad record).
    const same = { response: { flightroute: { airline: { name: 'TUI Airways' }, origin: { iata_code: 'FUE', municipality: 'Fuerteventura' }, destination: { iata_code: 'FUE', municipality: 'Fuerteventura' } } } };
    const d5 = createPlaneData((url) => Promise.resolve({ ok: true, status: 200, json: async () => (/adsbdb/.test(url) ? same : { ac: [{ hex: 'tom001', flight: 'TOM5MH', alt_baro: 16000, gs: 333, track: 0, lat: 51.5, lon: -0.45 }] }) }));
    d5.update({ lat: 51.47, lon: -0.45 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    d5.state.routeAt = 0; d5.update({ lat: 51.47, lon: -0.45 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    const tom = d5.planes()[0];
    assert.ok(tom.route && !tom.route.from && tom.airline === 'TUI Airways', 'same-airport route dropped, airline kept: ' + JSON.stringify(tom.route));
    // A route on the other side of the world (a reused flight number) is ignored.
    const far = { response: { flightroute: { airline: { name: 'VistaJet' }, origin: { iata_code: 'EWR', municipality: 'New York', latitude: 40.69, longitude: -74.17 }, destination: { iata_code: 'TPA', municipality: 'Tampa', latitude: 27.98, longitude: -82.53 } } } };
    const d6 = createPlaneData((url) => Promise.resolve({ ok: true, status: 200, json: async () => (/adsbdb/.test(url) ? far : { ac: [{ hex: 'vjt001', flight: 'VJT779', t: 'GL7T', alt_baro: 11800, gs: 338, track: 90, lat: 52.04, lon: -0.95 }] }) }));
    d6.update({ lat: 52.04, lon: -0.76 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    d6.state.routeAt = 0; d6.update({ lat: 52.04, lon: -0.76 }); for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    const vjt = d6.planes()[0];
    assert.ok(vjt.route && !vjt.route.from && vjt.airline === 'VistaJet', 'far-away route dropped: ' + JSON.stringify(vjt.route));
    console.log('  ok - planes data: nearby aircraft, nearest first, routes');

    // Drawing: feed the effect's data directly.
    const fake = ps.map((p, i) => ({ ...p, dist: 3 + i * 4, brg: 45 + i * 90 }));
    const more = fake.concat(fake.map((p, i) => ({ ...p, hex: p.hex + 'x', cs: p.cs + 'X', dist: 12 + i, brg: 200 + i * 30 })));
    effect._data.update = () => {}; effect._data.planes = () => more;
    const layouts = { 'one': [[0, 0]], 'two': [[0, 0], [1, 0]], 'three': [[0, 0], [1, 0], [2, 0]], 'six': [0, 1, 2, 3, 4, 5].map((x) => [x, 0]),
      '3x2': [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], 'stack': [[0, 0], [0, 1]], 'L': [[0, 0], [0, 1], [1, 1]], '2x2': [[0, 0], [1, 0], [0, 1], [1, 1]] };
    for (const [name, cells] of Object.entries(layouts)) {
      const core = new CubeCore(64); core.initWall(cells.map(([gx, gy]) => ({ gx, gy })), 64);
      core.effectOptions = { planes: { lat: 51.47, lon: -0.45 } };
      for (let i = 0; i < 40; i++) effect.wall(core, 1 / 30);
      const occ = new Set(cells.map(([x, y]) => x + ',' + y));
      let lit = 0, stray = 0;
      for (let y = 0; y < core.wallH; y++) for (let x = 0; x < core.wallW; x++) { const o = (y * core.wallW + x) * 3, v = core.wallBuf[o] + core.wallBuf[o + 1] + core.wallBuf[o + 2]; if (!Number.isFinite(v)) stray += 1000; if (v > 0) { lit++; if (!occ.has(Math.floor(x / 64) + ',' + Math.floor(y / 64))) stray++; } }
      // Every panel has something on it.
      for (const [gx, gy] of cells) { let s = 0; for (let y = gy * 64; y < gy * 64 + 64; y++) for (let x = gx * 64; x < gx * 64 + 64; x++) { const o = (y * core.wallW + x) * 3; s += core.wallBuf[o]; } assert.ok(s > 5, `${name}: panel ${gx},${gy} shows something`); }
      assert.strictEqual(stray, 0, name + ': only on panels');
    }
    // Radar style on two panels, and an empty sky.
    const c2 = new CubeCore(64); c2.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); c2.effectOptions = { planes: { lat: 1, lon: 1, style: 'radar' } };
    effect.wall(c2, 1 / 30);
    effect._data.planes = () => [];
    effect.wall(c2, 1 / 30);
    assert.ok(c2.wallBuf.some((v) => v > 0), 'empty sky still draws (radar sweep + message)');
    // The cube: all six faces in use.
    effect._data.planes = () => more;
    const cube = new CubeCore(64); cube.effectOptions = { planes: { lat: 1, lon: 1 } };
    for (let i = 0; i < 10; i++) effect(cube, 1 / 30);
    for (let f = 0; f < 6; f++) { let s = 0; for (let i = 0; i < 64 * 64; i++) { const idx = cube.faceMap[f][i]; if (idx >= 0) s += cube.colBuf[idx * 3] + cube.colBuf[idx * 3 + 1]; } assert.ok(s > 5, 'cube face ' + f); }
    // The overhead alert over another effect: a banner when one is due within 15 s; nothing otherwise.
    const ca = new CubeCore(64); ca.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
    const amber = () => { let n = 0; for (let i = 0; i < ca.wallBuf.length; i += 3) if (ca.wallBuf[i] > 0.4 && ca.wallBuf[i + 1] > 0.2 && ca.wallBuf[i + 2] < 0.15) n++; return n; };
    effect._data.planes = () => [{ ...more[0], dueIn: 40, overhead: false }];
    effect.alert(ca, 'wall', { effect: 'plasma', effectOptions: { planes: { alert: true, lat: 1, lon: 1 } } }, 1 / 30);
    assert.strictEqual(amber(), 0, 'no banner 40 s out');
    effect._data.planes = () => [{ ...more[0], dueIn: 10, overhead: false }];
    effect.alert(ca, 'wall', { effect: 'plasma', effectOptions: { planes: { alert: true, lat: 1, lon: 1 } } }, 1 / 30);
    assert.ok(amber() > 50, 'banner 10 s out: ' + amber());
    ca.wallBuf.fill(0);
    effect.alert(ca, 'wall', { effect: 'plasma', effectOptions: { planes: { alert: false, lat: 1, lon: 1 } } }, 1 / 30);
    assert.strictEqual(amber(), 0, 'off unless chosen');
    console.log('  ok - planes: board, radar and compact on every layout and the cube');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
