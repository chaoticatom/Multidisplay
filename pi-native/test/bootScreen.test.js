// Verifies the instant boot screen (app.js's renderBootScreen) actually
// renders to the driver before anything else - can't easily unit-test
// app.js's main() directly (it's a self-running script, not an exported
// function), so this spawns the real process and checks stdout ordering:
// mockDriver's "frame 1" log line (which fires from inside
// renderBootScreen's driver.renderFrame call) must appear before the
// "WS server listening" line, proving it's rendered before the WS server
// (and therefore the animation loop, which starts after) exists at all.
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

function test(name, fn) {
  return fn().then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function run() {
  await test('boot screen renders (mockDriver frame 1, amber fill) before the WS server starts listening', () => new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(__dirname, '../src/app.js')], {
      env: { ...process.env, DRIVER: 'mock', SKIP_WIFI_SETUP: '1' },
      cwd: path.join(__dirname, '..'),
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timed out waiting for expected log lines')); }, 5000);
    child.stdout.on('data', (d) => {
      output += d.toString();
      if (output.includes('WS server listening')) {
        clearTimeout(timer);
        child.kill();
        const frame1Idx = output.indexOf('frame 1,');
        const wsIdx = output.indexOf('WS server listening');
        try {
          assert.ok(frame1Idx >= 0, 'expected mockDriver "frame 1" log line, got:\n' + output);
          assert.ok(frame1Idx < wsIdx, 'expected boot-screen frame to render before the WS server starts, got:\n' + output);
          // avg brightness (0.35+0.18+0.0)/3 = 0.17666... - confirms it's
          // the amber BOOT_COLOR fill, not an effect's output.
          assert.ok(/avg brightness=0\.176|avg brightness=0\.177/.test(output), 'expected boot-color average brightness ~0.177, got:\n' + output);
          resolve();
        } catch (e) { reject(e); }
      }
    });
    child.on('error', reject);
  }));

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll bootScreen tests passed');
  }
}

run();
