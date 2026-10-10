// Your own Alexa skill: "Alexa, ask led wall to show fireworks". Amazon
// sends each request to POST /alexa on the Pi, through the Cloudflare tunnel
// (Alexa needs a public HTTPS address). Setup > Alexa skill has the steps,
// and GET /alexa/model.json gives the interaction model to paste into the
// Alexa developer console (its effect list comes from this display).
// Every request is checked as Amazon's: the signing certificate (from
// s3.amazonaws.com/echo.api/, issued to echo-api.amazon.com, chaining to a
// trusted root), the body's signature, a fresh timestamp, and the skill ID
// saved in Setup - anything else is refused.
'use strict';

const crypto = require('crypto');
const tls = require('tls');
const { fetchWithTimeout } = require('./effects/net');

const MAX_BODY = 64 * 1024;
const MAX_AGE_S = 150;
const certCache = new Map(); // url -> { leaf, until }

function certUrlOk(u) {
  let url;
  try { url = new URL(u); } catch (e) { return false; }
  const path = require('path').posix.normalize(url.pathname);
  return url.protocol === 'https:' && url.hostname.toLowerCase() === 's3.amazonaws.com' && path.startsWith('/echo.api/') && (url.port === '' || url.port === '443');
}

// The chain's leaf certificate, checked (cached until it expires).
async function signingCert(u, now = Date.now(), fetchFn = fetchWithTimeout) {
  const hit = certCache.get(u);
  if (hit && now < hit.until) return hit.leaf;
  const res = await fetchFn(u, {}, 8000);
  if (!res.ok) throw new Error('cert fetch ' + res.status);
  const pem = await res.text();
  const certs = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map((p) => new crypto.X509Certificate(p));
  if (!certs.length) throw new Error('no certificate');
  const leaf = certs[0];
  if (now < Date.parse(leaf.validFrom) || now > Date.parse(leaf.validTo)) throw new Error('certificate expired');
  if (!/DNS:echo-api\.amazon\.com(,|$)/.test(String(leaf.subjectAltName || '').replace(/\s/g, ''))) throw new Error('certificate not for echo-api.amazon.com');
  for (let i = 0; i < certs.length - 1; i++) if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error('broken certificate chain');
  const top = certs[certs.length - 1];
  const trusted = tls.rootCertificates.some((r) => { try { const root = new crypto.X509Certificate(r); return root.subject === top.issuer && top.verify(root.publicKey); } catch (e) { return false; } })
    || tls.rootCertificates.some((r) => { try { return new crypto.X509Certificate(r).fingerprint256 === top.fingerprint256; } catch (e) { return false; } });
  if (!trusted) throw new Error('certificate not from a trusted authority');
  certCache.set(u, { leaf, until: Math.min(Date.parse(leaf.validTo), now + 24 * 3600 * 1000) });
  return leaf;
}

async function verify(headers, raw, body, skillId, opts = {}) {
  const now = opts.now ? opts.now() : Date.now();
  const app = body?.context?.System?.application?.applicationId || body?.session?.application?.applicationId;
  if (!skillId) throw new Error('no skill ID saved in Setup > Alexa skill');
  if (app !== skillId) throw new Error('wrong skill ID');
  const ts = Date.parse(body?.request?.timestamp || '');
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_S * 1000) throw new Error('request too old');
  const u = headers['signaturecertchainurl'], sig = headers['signature-256'];
  if (!u || !sig || !certUrlOk(u)) throw new Error('missing or bad signature headers');
  const leaf = await signingCert(u, now, opts.fetchFn);
  if (!crypto.verify('sha256', raw, leaf.publicKey, Buffer.from(sig, 'base64'))) throw new Error('bad signature');
}

// ---- The interaction model (pasted into the Alexa developer console) ----
function model(invocation, names, scenes) {
  const values = Object.entries(names).filter(([k]) => k !== 'none').map(([k, n]) => {
    const name = n.replace(/[^\w &'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const syn = k.replace(/_/g, ' ');
    return { id: k, name: { value: name || syn, synonyms: syn !== name ? [syn] : [] } };
  });
  for (const sc of scenes || []) values.push({ id: 'scene:' + sc.name, name: { value: sc.name.toLowerCase(), synonyms: [sc.name.toLowerCase() + ' scene'] } });
  return {
    interactionModel: {
      languageModel: {
        invocationName: invocation,
        intents: [
          { name: 'ShowIntent', slots: [{ name: 'effect', type: 'EFFECT' }], samples: ['show {effect}', 'switch to {effect}', 'put on {effect}', 'play {effect}', 'start {effect}', '{effect}'] },
          { name: 'AskIntent', slots: [{ name: 'text', type: 'AMAZON.SearchQuery' }], samples: ['make it {text}', 'set up {text}', 'create {text}', 'draw {text}', 'i want {text}'] },
          { name: 'ChatIntent', slots: [{ name: 'text', type: 'AMAZON.SearchQuery' }], samples: ['tell the face {text}', 'say to the face {text}', 'ask the face {text}', 'chat {text}'] },
          { name: 'JokeIntent', slots: [], samples: ['tell me a joke', 'tell a joke', 'make me laugh', 'say something funny'] },
          { name: 'TurnOffIntent', slots: [], samples: ['turn off', 'switch off', 'go dark', 'turn the display off'] },
          { name: 'TurnOnIntent', slots: [], samples: ['turn on', 'switch on', 'wake up', 'turn the display on'] },
          { name: 'BrightnessIntent', slots: [{ name: 'level', type: 'AMAZON.NUMBER' }], samples: ['brightness {level}', 'brightness {level} percent', 'set brightness to {level} percent', 'set the brightness to {level}'] },
          { name: 'VolumeIntent', slots: [{ name: 'level', type: 'AMAZON.NUMBER' }], samples: ['volume {level}', 'volume {level} percent', 'set volume to {level} percent', 'set the volume to {level}'] },
          { name: 'AMAZON.HelpIntent', samples: [] }, { name: 'AMAZON.StopIntent', samples: [] }, { name: 'AMAZON.CancelIntent', samples: [] },
          { name: 'AMAZON.FallbackIntent', samples: [] }, { name: 'AMAZON.NavigateHomeIntent', samples: [] },
        ],
        types: [{ name: 'EFFECT', values }],
      },
    },
  };
}

// ---- Answering ----
const speak = (text, end = true) => ({ version: '1.0', response: { ...(text ? { outputSpeech: { type: 'PlainText', text } } : {}), shouldEndSession: end } });
const HELP = 'You can say: show fireworks, make it a calm sunset, tell the face hello, tell me a joke, brightness 50 percent, volume 30 percent, or turn off. What would you like?';

// The slot's effect key: Alexa's own match (entity resolution id) first,
// then the closest name.
function effectFrom(slot, names, scenes) {
  const res = slot?.resolutions?.resolutionsPerAuthority?.find((r) => r.status?.code === 'ER_SUCCESS_MATCH');
  const id = res?.values?.[0]?.value?.id;
  if (id && (names[id] || id.startsWith('scene:'))) return id;
  const said = String(slot?.value || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (!said) return null;
  const sc = (scenes || []).find((s) => s.name.toLowerCase() === said);
  if (sc) return 'scene:' + sc.name;
  let best = null, score = 0;
  for (const [k, n] of Object.entries(names)) {
    const nn = n.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), kk = k.replace(/_/g, ' ');
    const s = nn === said || kk === said ? 3 : nn.includes(said) || said.includes(nn) ? 2 : said.split(' ').some((w) => w.length > 3 && nn.includes(w)) ? 1 : 0;
    if (s > score) { score = s; best = k; }
  }
  return best;
}

// server: the WsServer (runCommand, state, faceTalk). Resolves the Alexa JSON reply.
async function answer(server, body, names) {
  const r = body.request || {}, state = server.state;
  const run = (m) => server.runCommand(m);
  if (r.type === 'LaunchRequest') return speak('Display here. ' + HELP, false);
  if (r.type === 'SessionEndedRequest') return speak('');
  if (r.type !== 'IntentRequest') return speak('');
  const name = r.intent?.name, slots = r.intent?.slots || {};
  const pct = (s) => { const n = Number(s?.value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
  switch (name) {
    case 'ShowIntent': {
      const k = effectFrom(slots.effect, names, state.scenes);
      if (!k) return speak('I don\'t have that one. Try fireworks, plasma, the clock or the weather.', false);
      if (k.startsWith('scene:')) { run({ cmd: 'applyScene', name: k.slice(6) }); return speak('Okay, ' + k.slice(6) + '.'); }
      run({ cmd: 'setEffect', effect: k });
      return speak('Showing ' + names[k].replace(/[^\w &'-]/g, '').trim() + '.');
    }
    case 'AskIntent': {
      const text = String(slots.text?.value || '').trim();
      if (!text) return speak('What should I show?', false);
      const said = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('Working on it.'), 6500); // Alexa waits 8 seconds at most
        server.runCommand({ cmd: 'aiAsk', text }, { readyState: 1, role: 'admin', send(j) { clearTimeout(timer); const m = JSON.parse(j); resolve(m.off ? 'Turn on the AI assistant in the display\'s Setup first.' : m.error ? 'Sorry, ' + m.error : m.say || 'Done.'); } });
      });
      return speak(said);
    }
    case 'ChatIntent': {
      const text = String(slots.text?.value || '').trim();
      if (!text) return speak('What should I tell the face?', false);
      if (state.effect !== 'talking_face') run({ cmd: 'setEffect', effect: 'talking_face' });
      server.faceTalk.chat(text);
      return speak(''); // the face answers, in its own voice
    }
    case 'JokeIntent':
      if (state.effect !== 'talking_face') run({ cmd: 'setEffect', effect: 'talking_face' });
      server.faceTalk.chat('Tell me a joke.');
      return speak('');
    case 'TurnOffIntent': run({ cmd: 'clearAll' }); return speak('Okay.');
    case 'TurnOnIntent': run({ cmd: 'setEffect', effect: state.effect && state.effect !== 'none' ? state.effect : 'plasma' }); if (state.panelsOff) run({ cmd: 'setPanelsOff', on: false }); return speak('Okay.');
    case 'BrightnessIntent': { const p = pct(slots.level); if (p === null) return speak('What brightness, from 1 to 100?', false); run({ cmd: 'setBrightness', value: Math.max(0.1, p / 100 * 1.5) }); return speak('Brightness ' + p + ' percent.'); }
    case 'VolumeIntent': { const p = pct(slots.level); if (p === null) return speak('What volume, from 0 to 100?', false); run({ cmd: 'setMasterVolume', value: p / 100 }); return speak('Volume ' + p + ' percent.'); }
    case 'AMAZON.HelpIntent': return speak(HELP, false);
    case 'AMAZON.FallbackIntent': return speak('Sorry, I didn\'t get that. ' + HELP, false);
    default: return speak(''); // Stop, Cancel, NavigateHome
  }
}

// POST /alexa (Amazon) and GET /alexa/model.json. Returns true when handled.
function handle(server, req, res, opts = {}) {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/alexa')) return false;
  const names = require('./effects').EFFECT_NAMES;
  const cfg = (server.state.prefs && server.state.prefs.alexa) || {};
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o, null, code === 200 && req.method === 'GET' ? 2 : 0)); };
  if (req.method === 'GET' && url === '/alexa/model.json') { json(200, model(cfg.invocation || 'led wall', names, server.state.scenes)); return true; }
  if (req.method !== 'POST' || url !== '/alexa') { json(404, { error: 'not found' }); return true; }
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    const raw = Buffer.concat(chunks);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch (e) { json(400, { error: 'bad json' }); return; }
    try { await verify(req.headers, raw, body, cfg.skillId, opts); } catch (e) {
      if (server.alexaSkillStatus) server.alexaSkillStatus.error = 'Refused a request: ' + e.message;
      json(400, { error: 'refused' }); return;
    }
    if (server.alexaSkillStatus) { server.alexaSkillStatus.lastSeen = Date.now(); server.alexaSkillStatus.error = ''; }
    try { json(200, await answer(server, body, names)); } catch (e) { json(200, speak('Sorry, something went wrong: ' + e.message)); }
  });
  return true;
}

module.exports = { handle, verify, model, answer, effectFrom, certUrlOk, _certCache: certCache };
