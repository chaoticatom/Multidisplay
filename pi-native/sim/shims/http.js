// Browser stand-in for Node's http/https (the online demo bundle): the only
// user is radio/icyTitle.js (song titles from a station's stream), which
// can't work from a browser page anyway - every request just fails, so the
// title stays empty.
'use strict';
function get() {
  const req = {
    on(ev, fn) { if (ev === 'error') setTimeout(() => fn(new Error('not available in the browser')), 0); return req; },
    setTimeout() { return req; },
    destroy() {},
  };
  return req;
}
module.exports = { get, request: get };
