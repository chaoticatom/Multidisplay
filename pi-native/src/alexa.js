// Alexa without a skill: the Pi pretends to be a Philips Hue bridge on the
// home network, so an Echo finds the display's "lights" with "Alexa,
// discover devices", and everything stays local (no Amazon account set-up,
// no cloud). Setup > Alexa turns it on (prefs.alexa.on). Devices:
//   Display      - on/off blanks the display, "set Display to 40%" = brightness
//   Volume       - "set Volume to 30%" = the overall volume; off = silent
//   <effect>     - one per favourite effect (or a starter set): on shows it
//   <scene>      - one per saved scene: on recalls it
// Echos only look for Hue bridges on port 80 (the service runs as root, so
// it can listen there). Discovery is SSDP: UDP multicast 239.255.255.250:1900.
// The Hue v1 API surface here is the part Echos use - the same subset Home
// Assistant's emulated_hue answers.
'use strict';

const http = require('http');
const dgram = require('dgram');
const os = require('os');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const STARTERS = ['plasma', 'fireworks', 'datetime', 'weather', 'talking_face', 'radio'];

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}
function macish() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && a.mac && a.mac !== '00:00:00:00:00:00') return a.mac.replace(/:/g, '').toLowerCase();
  }
  return 'b827eb000001';
}
// A stable light id per device key, so the Echo's list survives changes to
// the favourites (ids are just numbers to it).
function lightId(key) {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return String(10 + (h % 9000));
}
const toBri = (f) => Math.max(1, Math.min(254, Math.round(f * 254)));

// The devices for the current state: [{ key, name, on, level (0..1) }].
// run(msg) carries out a control-page command (wsServer.runCommand).
function devices(state, names) {
  const p = state.prefs || {};
  const out = [];
  out.push({ key: 'display', name: 'Display', on: !state.blank && !state.panelsOff, level: Math.min(1, (state.brightness ?? 1) / 1.5) });
  out.push({ key: 'volume', name: 'Volume', on: (p.volume ?? 1) > 0, level: p.volume ?? 1 });
  const favs = (p.favourites || []).filter((k) => names[k]);
  for (const k of (favs.length ? favs : STARTERS.filter((x) => names[x])).slice(0, 30)) {
    out.push({ key: 'fx:' + k, name: names[k].replace(/[^\w &'-]/g, '').trim() || k, on: state.effect === k && !state.blank, level: 1 });
  }
  for (const sc of (state.scenes || []).slice(0, 20)) out.push({ key: 'scene:' + sc.name, name: sc.name, on: false, level: 1 });
  return out;
}

function hueLight(d, serial) {
  return {
    state: { on: !!d.on, bri: toBri(d.level), alert: 'none', reachable: true, mode: 'homeautomation' },
    type: 'Dimmable light', name: d.name, modelid: 'LWB010', manufacturername: 'Philips', productname: 'Hue white lamp',
    uniqueid: `00:17:88:01:${serial.slice(-6).replace(/(..)(..)(..)/, '$1:$2:$3')}:${lightId(d.key).padStart(4, '0').replace(/(..)(..)/, '$1:$2')}-0b`, swversion: '1.46.13_r26312',
  };
}

// What a Hue state change means for the display.
function apply(d, body, state, run, lastVolume) {
  const on = body.on, bri = Number(body.bri);
  const level = Number.isFinite(bri) ? Math.max(0, Math.min(1, bri / 254)) : null;
  if (d.key === 'display') {
    if (on === false) run({ cmd: 'clearAll' });
    if (on === true && state.blank) run({ cmd: 'setEffect', effect: state.effect && state.effect !== 'none' ? state.effect : 'plasma' });
    if (on === true && state.panelsOff) run({ cmd: 'setPanelsOff', on: false });
    if (level !== null) run({ cmd: 'setBrightness', value: Math.max(0.1, level * 1.5) });
  } else if (d.key === 'volume') {
    if (level !== null) run({ cmd: 'setMasterVolume', value: level });
    else if (on === false) { lastVolume.v = (state.prefs && state.prefs.volume) || lastVolume.v; run({ cmd: 'setMasterVolume', value: 0 }); }
    else if (on === true) run({ cmd: 'setMasterVolume', value: lastVolume.v || 0.6 });
  } else if (d.key.startsWith('fx:')) {
    const k = d.key.slice(3);
    if (on === true) run({ cmd: 'setEffect', effect: k });
    else if (on === false && state.effect === k) run({ cmd: 'clearAll' });
  } else if (d.key.startsWith('scene:')) {
    if (on === true) run({ cmd: 'applyScene', name: d.key.slice(6) });
    else if (on === false) run({ cmd: 'clearAll' });
  }
}

function createAlexa({ state, names, run, port = 80, ip = lanIp, createSocket = dgram.createSocket, createServer = http.createServer, log = console.log } = {}) {
  const serial = macish();
  const bridgeId = (serial.slice(0, 6) + 'fffe' + serial.slice(6)).toUpperCase();
  const uuid = `2f402f80-da50-11e1-9b23-${serial}`;
  const status = { on: false, error: '', lastSeen: 0, lastCommand: '' };
  const lastVolume = { v: 0.6 };
  let server = null, sock = null;

  const list = () => devices(state, names());
  const lightsMap = () => Object.fromEntries(list().map((d) => [lightId(d.key), hueLight(d, serial)]));
  const config = () => ({ name: 'Multidisplay', bridgeid: bridgeId, mac: serial.replace(/(..)(?!$)/g, '$1:'), modelid: 'BSB002', apiversion: '1.17.0', swversion: '1935144040', ipaddress: ip(), linkbutton: true, whitelist: {} });

  function description() {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<URLBase>http://${ip()}:${port}/</URLBase>
<device>
<deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType>
<friendlyName>Multidisplay (${ip()})</friendlyName>
<manufacturer>Royal Philips Electronics</manufacturer>
<manufacturerURL>http://www.philips.com</manufacturerURL>
<modelDescription>Philips hue Personal Wireless Lighting</modelDescription>
<modelName>Philips hue bridge 2015</modelName>
<modelNumber>BSB002</modelNumber>
<modelURL>http://www.meethue.com</modelURL>
<serialNumber>${serial}</serialNumber>
<UDN>uuid:${uuid}</UDN>
</device>
</root>`;
  }

  function handle(req, res) {
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    const parts = req.url.split('?')[0].split('/').filter(Boolean);
    if (req.method === 'GET' && (parts[0] === 'description.xml' || parts[0] === 'upnp')) return send(200, description(), 'text/xml');
    if (parts[0] !== 'api') return send(404, 'not found', 'text/plain');
    status.lastSeen = Date.now();
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch (e) { /* empty */ }
      // POST /api: an Echo "pairing" - any username is accepted.
      if (req.method === 'POST' && parts.length === 1) return send(200, [{ success: { username: 'multidisplay' } }]);
      if (parts.length === 1 || (parts.length === 2 && parts[1] === 'config')) return send(200, config());
      const rest = parts.slice(2);
      if (rest.length === 0) return send(200, { lights: lightsMap(), groups: {}, config: config(), schedules: {}, scenes: {}, rules: {}, sensors: {}, resourcelinks: {} });
      if (rest[0] === 'config') return send(200, config());
      if (rest[0] !== 'lights') return send(200, {});
      if (rest.length === 1) return send(200, lightsMap());
      const d = list().find((x) => lightId(x.key) === rest[1]);
      if (!d) return send(200, [{ error: { type: 3, address: '/lights/' + rest[1], description: 'resource not available' } }]);
      if (rest.length === 2) return send(200, hueLight(d, serial));
      if (rest[2] === 'state' && req.method === 'PUT') {
        apply(d, json, state, run, lastVolume);
        status.lastCommand = d.name + ': ' + JSON.stringify(json);
        return send(200, Object.keys(json).map((k) => ({ success: { [`/lights/${rest[1]}/state/${k}`]: json[k] } })));
      }
      return send(200, {});
    });
  }

  // SSDP: answer an Echo's M-SEARCH with where our "bridge" lives.
  function onSearch(msg, rinfo) {
    const text = msg.toString();
    if (!/^M-SEARCH/i.test(text)) return;
    const st = (text.match(/^ST:\s*(.+)$/im) || [])[1];
    if (!st || !/ssdp:all|upnp:rootdevice|device:basic:1|hue/i.test(st.trim())) return;
    const sts = [['upnp:rootdevice', `uuid:${uuid}::upnp:rootdevice`], [`uuid:${uuid}`, `uuid:${uuid}`], ['urn:schemas-upnp-org:device:basic:1', `uuid:${uuid}`]];
    for (const [s, usn] of sts) {
      const reply = Buffer.from(['HTTP/1.1 200 OK', 'HOST: 239.255.255.250:1900', 'EXT:', 'CACHE-CONTROL: max-age=100', `LOCATION: http://${ip()}:${port}/description.xml`, 'SERVER: Linux/3.14.0 UPnP/1.0 IpBridge/1.24.0', `hue-bridgeid: ${bridgeId}`, `ST: ${s}`, `USN: ${usn}`, '', ''].join('\r\n'));
      try { sock.send(reply, rinfo.port, rinfo.address); } catch (e) { /* the Echo will ask again */ }
    }
  }

  function start() {
    if (status.on) return;
    status.error = '';
    try {
      server = createServer(handle);
      server.on('error', (e) => { status.error = e.code === 'EADDRINUSE' ? `port ${port} is already used by another program` : e.code === 'EACCES' ? `no permission to use port ${port}` : e.message; log('[alexa] ' + status.error); stop(); });
      server.listen(port);
      sock = createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (e) => { status.error = 'discovery: ' + e.message; log('[alexa] ' + status.error); });
      sock.on('message', onSearch);
      sock.bind(SSDP_PORT, () => { try { sock.addMembership(SSDP_ADDR); } catch (e) { status.error = 'discovery: ' + e.message; } });
      status.on = true;
      log(`[alexa] Hue bridge emulation on ${ip()}:${port}`);
    } catch (e) { status.error = e.message; stop(); }
  }
  function stop() {
    if (server) { try { server.close(); } catch (e) { /* closed */ } server = null; }
    if (sock) { try { sock.close(); } catch (e) { /* closed */ } sock = null; }
    status.on = false;
  }
  function sync() { const want = !!(state.prefs && state.prefs.alexa && state.prefs.alexa.on); if (want && !status.on && !status.error) start(); else if (!want && status.on) stop(); else if (!want) status.error = ''; }

  return { start, stop, sync, status, devices: list, _test: { handle, onSearch, lightId } };
}

module.exports = { createAlexa, devices, lightId };
