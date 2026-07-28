// Splits the esbuild-produced three.min.js into N roughly-equal parts so the
// ESP32 never has to serve one continuous ~480KB response - each part is a
// separate HTTP request/connection, giving the suspected leaking/limited
// lwIP resource pool (see firmware/platformio.ini's notes on the
// large-file wedge) real breathing room to drain between them, the same
// idea as the existing STATIC_STREAM_CHUNK_BYTES throttling but one level
// up (per-request instead of per-chunk-within-a-request).
//
// Parts are NOT valid standalone JavaScript - splitting is done by plain
// character count (safe for JS string reassembly: concatenating string
// slices always reconstructs the exact original text, regardless of where
// the cut falls) rather than at any syntactic boundary. The browser fetches
// every part, concatenates them back into the original source, and only
// then executes the assembled whole - see the loader in index.html.
//
// Usage: node build-tools/split-three.js <input> <outputPrefix> <partCount>
const fs = require('fs');

const [, , input, outPrefix, partCountArg] = process.argv;
if (!input || !outPrefix || !partCountArg) {
  console.error('Usage: node split-three.js <input> <outputPrefix> <partCount>');
  process.exit(1);
}
const partCount = parseInt(partCountArg, 10);
const src = fs.readFileSync(input, 'utf8');
const partSize = Math.ceil(src.length / partCount);

for (let i = 0; i < partCount; i++) {
  const chunk = src.slice(i * partSize, (i + 1) * partSize);
  fs.writeFileSync(`${outPrefix}${i}.js`, chunk);
  console.log(`    ${outPrefix}${i}.js: ${chunk.length} bytes`);
}
