// No-hardware driver for development/testing (this is what runs in CI/this
// sandbox - there's no ARM board or physical panels available here). Prints
// a periodic summary instead of pushing pixels anywhere, so the rest of the
// pipeline (core, effects, WS server) can be exercised and verified end to
// end without hardware. Swap for rgbMatrixDriver.js on the real Pi.
class MockDriver {
  constructor() {
    this.frameCount = 0;
    this._lastLog = 0;
  }

  renderFrame(core) {
    this.frameCount++;
    const now = Date.now();
    if (now - this._lastLog < 1000) return; // log ~once/sec, not every frame
    this._lastLog = now;
    const buf = core.wallBuf || core.colBuf; // wall mode has no cube colBuf content
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const avg = sum / buf.length;
    console.log(`[mockDriver] frame ${this.frameCount}, N=${core.wallBuf ? core.wallW * core.wallH : core.N}, avg brightness=${avg.toFixed(3)}`);
  }

  close() {}
}

module.exports = MockDriver;
