// fetch() with a timeout, for every effect that calls an external API.
// Plain fetch() has none: a server that accepts the connection and then
// never answers left the effect stuck on "Loading…" indefinitely, and
// its once-in-flight guard meant it never retried either. Aborting after
// FETCH_TIMEOUT_MS turns that into an ordinary network error, which each
// effect's existing catch/retry path already handles. Looks up fetch at
// call time (not at require time) so tests can still stub global.fetch.
'use strict';

const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  if (opts.signal) return globalThis.fetch(url, opts);
  return globalThis.fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

module.exports = { fetchWithTimeout, FETCH_TIMEOUT_MS };
