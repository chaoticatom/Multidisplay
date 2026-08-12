// Radio-browser.info directory search - ported faithfully from
// effects-core.js's radioBrowserFetch()/radioSearchStations() (same two
// mirror hosts, same fallback-to-second-mirror-on-failure, same query
// shape). Uses Node's built-in fetch (18+), same as weather/fetch.js and
// cam.js already do - no extra dependency needed.
'use strict';

const RADIO_BROWSER_MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function radioBrowserFetch(path) {
  let lastErr = null;
  for (const base of RADIO_BROWSER_MIRRORS) {
    try {
      const r = await fetchWithTimeout(base + path);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all mirrors failed');
}

// query: string (empty/falsy -> "top clicked" browse list, matching the
// original's no-query behaviour). Returns {results, error} - never throws,
// same "degrade cleanly" contract as fetchWeather().
async function searchStations(query) {
  try {
    const path = query
      ? '/json/stations/search?name=' + encodeURIComponent(query) + '&limit=60&hidebroken=true&order=clickcount&reverse=true'
      : '/json/stations/topclick/60?hidebroken=true';
    const data = await radioBrowserFetch(path);
    const results = (data || []).filter((s) => s.url_resolved || s.url).map((s) => ({
      name: s.name || 'Unnamed station',
      genre: (s.tags || '').split(',').slice(0, 2).join(', ') || s.country || '',
      url: s.url_resolved || s.url,
    }));
    return { results, error: null };
  } catch (e) {
    return { results: [], error: 'Directory unreachable — try again, or use the featured list below' };
  }
}

module.exports = { searchStations, RADIO_BROWSER_MIRRORS };
