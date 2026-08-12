// Shared panorama/mirror/tile/perspective projection math, ported from
// effects-media.js's renderImg() and effectVideo() - the browser
// duplicates this compositing+projection logic almost verbatim across the
// static-image and live-video code paths (per CLAUDE.md's porting notes
// on this task); this module is the single copy pi-native's video.js uses
// for both real ffmpeg frames.
//
// Two source-of-truth divergences existed between the browser's two
// copies, both resolved here in favor of renderImg()'s more complete
// version (documented at the point each is used below), since
// effectVideo()'s versions look like real gaps rather than intentional
// differences:
//   1. vidLayout==='perspective': effectVideo() never actually draws
//      anything for this layout (its compositing branch only handles
//      'panorama'/'mirror'/'tile', so a live-video canvas at this layout
//      would show stale/blank content) while renderImg() explicitly
//      treats it identically to 'panorama' (cw=4S, ch=S). Followed
//      renderImg() here - there's no "stale canvas" state to even
//      reproduce faithfully since this module rebuilds the composite
//      fresh every tick from scratch.
//   2. The projection loop's panorama-scroll math: effectVideo() only
//      applies it when vidLayout==='panorama', renderImg() applies it for
//      'panorama'||'perspective'. Followed renderImg() here for the same
//      "perspective behaves like panorama" reasoning as (1).
'use strict';

const { VID_FACE_ORDER } = require('../_shared');

// Approximates the browser's `vidCtx.filter = brightness(b) saturate(s)`
// canvas 2D filter (applied before drawImage in effectVideo()) - the
// standard CSS Filter Effects saturate() matrix (luminance-preserving
// scale toward gray) followed by a brightness multiply. Close enough at
// LED-wall resolution; there's no canvas filter API to call directly here.
function applyBrightSat(r, g, b, bright, sat) {
  const lum = 0.3086 * r + 0.6094 * g + 0.0820 * b;
  let rr = (lum + (r - lum) * sat) * bright;
  let gg = (lum + (g - lum) * sat) * bright;
  let bb = (lum + (b - lum) * sat) * bright;
  if (rr < 0) rr = 0; else if (rr > 255) rr = 255;
  if (gg < 0) gg = 0; else if (gg > 255) gg = 255;
  if (bb < 0) bb = 0; else if (bb > 255) bb = 255;
  return [rr, gg, bb];
}

// Nearest-neighbor sample from an RGB24 (3 bytes/px) buffer.
function sampleNN(buf, w, h, x, y) {
  const sx = Math.max(0, Math.min(w - 1, x | 0));
  const sy = Math.max(0, Math.min(h - 1, y | 0));
  const i = (sy * w + sx) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
}

// Builds the composite "canvas" the browser built with a real <canvas>'s
// drawImage() calls, as a plain RGB24 Uint8Array. `src`/`sw`/`sh` is the
// raw source frame - video.js chooses `sw`/`sh` to already match `layout`
// 1:1 for panorama/perspective (decoded straight at 4S×S, so this is just
// a per-pixel filter pass), and to a single S×S source tile for
// mirror/tile (composited here via flips/downsampling, mirroring the
// browser's 4× drawImage-with-scale/flip calls into a bigger canvas).
function buildComposite(src, sw, sh, S, layout, bright, sat) {
  let cw, ch;
  if (layout === 'panorama' || layout === 'perspective') { cw = 4 * S; ch = S; }
  else if (layout === 'mirror') { cw = 2 * S; ch = 2 * S; }
  else { cw = S; ch = S; } // tile

  const out = new Uint8Array(cw * ch * 3);

  if (layout === 'panorama' || layout === 'perspective') {
    // src is already cw×ch - straight per-pixel filter pass.
    const n = cw * ch;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = applyBrightSat(src[i * 3], src[i * 3 + 1], src[i * 3 + 2], bright, sat);
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
    }
    return { px: out, cw, ch };
  }

  if (layout === 'mirror') {
    // Draw the S×S source into all 4 quadrants of a 2S×2S canvas with the
    // same flips as the browser's mirror branch: top-left normal,
    // top-right flip-X, bottom-left flip-Y, bottom-right flip-both.
    for (let qy = 0; qy < 2; qy++) {
      for (let qx = 0; qx < 2; qx++) {
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const sx = qx === 0 ? x : S - 1 - x;
            const sy = qy === 0 ? y : S - 1 - y;
            const [r, g, b] = sampleNN(src, sw, sh, sx, sy);
            const [fr, fg, fb] = applyBrightSat(r, g, b, bright, sat);
            const oi = ((qy * S + y) * cw + (qx * S + x)) * 3;
            out[oi] = fr; out[oi + 1] = fg; out[oi + 2] = fb;
          }
        }
      }
    }
    return { px: out, cw, ch };
  }

  // tile: draw the S×S source, downscaled, into each hw×hw quadrant -
  // same 4 identical downscaled copies the browser's tile branch draws.
  const hw = S >> 1;
  for (let qy = 0; qy < 2; qy++) {
    for (let qx = 0; qx < 2; qx++) {
      for (let y = 0; y < hw; y++) {
        for (let x = 0; x < hw; x++) {
          const sx = (x / hw) * sw, sy = (y / hw) * sh;
          const [r, g, b] = sampleNN(src, sw, sh, sx, sy);
          const [fr, fg, fb] = applyBrightSat(r, g, b, bright, sat);
          const oi = ((qy * hw + y) * cw + (qx * hw + x)) * 3;
          out[oi] = fr; out[oi + 1] = fg; out[oi + 2] = fb;
        }
      }
    }
  }
  return { px: out, cw, ch };
}

// Projects the composite frame onto the 4 side faces + top/bottom -
// ported line-for-line from effectVideo()'s per-face loop and vidTB
// branches (RGBA/4 indexing swapped for RGB24/3, see module comment above
// for the two spots this intentionally follows renderImg() instead).
function projectToFaces(core, composite, S, layout, tb, scrollX) {
  const { px, cw, ch } = composite;
  const wrap = layout === 'panorama' || layout === 'perspective';

  for (let fIdx = 0; fIdx < 4; fIdx++) {
    const face = VID_FACE_ORDER[fIdx];
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        let srcX, srcY;
        if (wrap) {
          const pu = S - 1 - u;
          srcX = (((fIdx * S + pu + (scrollX | 0)) % (4 * S)) + 4 * S) % (4 * S);
          srcY = S - 1 - v;
        } else {
          srcX = u; srcY = S - 1 - v;
        }
        srcX = Math.max(0, Math.min(cw - 1, srcX));
        srcY = Math.max(0, Math.min(ch - 1, srcY));
        const pi = (srcY * cw + srcX) * 3;
        core.setFaceLED(face, u, v, px[pi] / 255, px[pi + 1] / 255, px[pi + 2] / 255);
      }
    }
  }

  if (tb === 'blur') {
    let ar = 0, ag = 0, ab = 0, cnt = 0;
    const total = cw * ch;
    const step = Math.max(1, Math.floor(total / 64));
    for (let i = 0; i < total; i += step) {
      ar += px[i * 3]; ag += px[i * 3 + 1]; ab += px[i * 3 + 2]; cnt++;
    }
    ar /= cnt; ag /= cnt; ab /= cnt;
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        core.setFaceLED(4, u, v, (ar / 255) * 0.55, (ag / 255) * 0.55, (ab / 255) * 0.55);
        core.setFaceLED(5, u, v, (ar / 255) * 0.35, (ag / 255) * 0.35, (ab / 255) * 0.35);
      }
    }
  } else if (tb === 'perspective') {
    // Sample the top row of each side panel and fan colour inward from
    // each edge - ported verbatim, including its reuse of `cw` from
    // whichever layout built `composite` (same quirk the browser has:
    // this math assumes a 4S-wide panorama-style composite regardless of
    // the actual layout selected, so combining tb='perspective' with a
    // mirror/tile layout looks odd in the browser too - not fixed here).
    const topBuf = new Float32Array(S * S * 3);
    const topW = new Float32Array(S * S);
    const faceEdge = [
      { fIdx: 0, axis: 'v', fromEdge: 0 },     // front  -> bottom
      { fIdx: 3, axis: 'v', fromEdge: S - 1 }, // back   -> top
      { fIdx: 1, axis: 'u', fromEdge: 0 },     // left   -> left
      { fIdx: 2, axis: 'u', fromEdge: S - 1 }, // right  -> right
    ];
    for (const { fIdx, axis, fromEdge } of faceEdge) {
      for (let col = 0; col < S; col++) {
        const srcX = (((fIdx * S + col) % (4 * S)) + 4 * S) % (4 * S);
        const pi = (0 * cw + Math.max(0, Math.min(cw - 1, srcX))) * 3;
        const r = px[pi] / 255, g = px[pi + 1] / 255, b = px[pi + 2] / 255;
        for (let depth = 0; depth < S; depth++) {
          const w = Math.pow(1 - depth / S, 2.2) * 0.95;
          if (w < 0.005) break;
          let tu, tv;
          if (axis === 'v') { tu = col; tv = fromEdge === 0 ? depth : S - 1 - depth; }
          else { tu = fromEdge === 0 ? depth : S - 1 - depth; tv = col; }
          if (tu < 0 || tu >= S || tv < 0 || tv >= S) continue;
          const ti = tv * S + tu;
          topBuf[ti * 3] += r * w; topBuf[ti * 3 + 1] += g * w; topBuf[ti * 3 + 2] += b * w;
          topW[ti] += w;
        }
      }
    }
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const ti = v * S + u;
        if (topW[ti] < 0.01) continue;
        const edgeDist = Math.min(u, v, S - 1 - u, S - 1 - v) / (S * 0.5);
        const fade = Math.max(0.12, 1 - edgeDist * 0.65);
        core.setFaceLED(4, u, v,
          Math.min(1, (topBuf[ti * 3] / topW[ti]) * fade),
          Math.min(1, (topBuf[ti * 3 + 1] / topW[ti]) * fade),
          Math.min(1, (topBuf[ti * 3 + 2] / topW[ti]) * fade));
      }
    }
  }
  // 'dark' (and 'spectrum', which video.js falls back to 'dark' for - no
  // audio pipeline here, see video.js's module comment) -> leave faces
  // 4/5 as whatever video.js already cleared them to (colBuf zeroed once
  // per tick before this runs, matching the browser's `colBuf[i]=0` loop
  // at the top of effectVideo()/renderImg()).
}

module.exports = { buildComposite, projectToFaces, applyBrightSat, sampleNN };
