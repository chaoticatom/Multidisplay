// Minimal Buffer polyfill injected as a global for the sim bundle. Real
// usage is confined to video/ffmpegSource.js's constructor (module-load-
// time `Buffer.alloc(0)`) - video playback itself needs a real ffmpeg
// process and is never reachable from the simulator UI, so this only has
// to be complete enough not to throw while that module loads, not to
// actually decode video.
const Buffer = {
  alloc(n) { return new Uint8Array(n); },
  from(v) { return v instanceof Uint8Array ? v : new Uint8Array(v); },
  concat(list) {
    const total = list.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of list) { out.set(b, o); o += b.length; }
    return out;
  },
};
export { Buffer };
