// Crash-safe JSON config saves. A plain fs.writeFileSync() truncates the
// real file first and then writes it, so a power cut mid-save (routine on
// a Pi that's simply unplugged) leaves a half-written file and the
// setting is lost on next boot. Writing a sibling temp file, fsyncing it,
// then rename()-ing it over the original means the file on disk is always
// either the complete old version or the complete new one - rename within
// one directory is atomic on Linux filesystems.
'use strict';
const fs = require('fs');
const path = require('path');

function atomicWriteJson(filePath, value) {
  const tmp = path.join(path.dirname(filePath), '.' + path.basename(filePath) + '.tmp');
  const text = JSON.stringify(value, null, 2); // serialise first: a throw here must not leave a temp file
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWriteJson };
