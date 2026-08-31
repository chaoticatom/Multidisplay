// Can't test scanDevices()/pairDevice()/etc. end-to-end (no bluetoothctl/
// pactl, no Bluetooth hardware in this sandbox) - this verifies the
// parsing logic (the only hardware-independent part) against realistic
// canned bluetoothctl output, and basic input validation.
const assert = require('assert');
const { MAC_RE, parseDeviceLines } = require('../src/bluetooth');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('MAC_RE');
test('accepts a valid MAC address', () => {
  assert.ok(MAC_RE.test('AA:BB:CC:DD:EE:FF'));
  assert.ok(MAC_RE.test('00:11:22:33:44:55'));
});
test('rejects malformed input', () => {
  assert.ok(!MAC_RE.test('not-a-mac'));
  assert.ok(!MAC_RE.test('AA:BB:CC:DD:EE'));
  assert.ok(!MAC_RE.test('AA:BB:CC:DD:EE:FF:00'));
  assert.ok(!MAC_RE.test('rm -rf /'));
});

console.log('parseDeviceLines');
test('extracts mac + name from realistic bluetoothctl scan output', () => {
  const sample = `
[bluetooth]# scan on
Discovery started
[CHG] Controller AA:BB:CC:DD:EE:00 Discovering: yes
[NEW] Device 11:22:33:44:55:66 JBL Flip 5
[NEW] Device AA:11:BB:22:CC:33 Pixel 7
[CHG] Device 11:22:33:44:55:66 RSSI: -60
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 2);
  assert.deepStrictEqual(devices.find((d) => d.mac === '11:22:33:44:55:66'), { mac: '11:22:33:44:55:66', name: 'JBL Flip 5' });
  assert.deepStrictEqual(devices.find((d) => d.mac === 'AA:11:BB:22:CC:33'), { mac: 'AA:11:BB:22:CC:33', name: 'Pixel 7' });
});
test('de-duplicates repeated device lines (same device seen multiple times during a scan)', () => {
  const sample = `
[NEW] Device 11:22:33:44:55:66 JBL Flip 5
[CHG] Device 11:22:33:44:55:66 RSSI: -55
[NEW] Device 11:22:33:44:55:66 JBL Flip 5
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 1);
});
test('empty/no-match input returns an empty array, not a throw', () => {
  assert.deepStrictEqual(parseDeviceLines(''), []);
  assert.deepStrictEqual(parseDeviceLines('no devices here'), []);
});
test('paired-devices output parses the same way', () => {
  const sample = 'Device 11:22:33:44:55:66 JBL Flip 5\nDevice AA:11:BB:22:CC:33 Pixel 7\n';
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 2);
});
test('a device whose name resolves AFTER the initial sighting gets upgraded from its MAC placeholder', () => {
  // A real report: the Pi only ever showed raw MAC addresses for devices
  // Windows resolved to a real make/model. Some devices' very first "[NEW]
  // Device ..." line carries no name yet (BlueZ echoes the MAC again as a
  // placeholder) - the real name arrives moments later via a separate
  // "[CHG] Device MAC Name: ..." line, which must be allowed to overwrite
  // that placeholder (unlike an RSSI update, which must NOT).
  const sample = `
[NEW] Device 11:22:33:44:55:66 11-22-33-44-55-66
[CHG] Device 11:22:33:44:55:66 RSSI: -60
[CHG] Device 11:22:33:44:55:66 Name: JBL Flip 5
[CHG] Device 11:22:33:44:55:66 RSSI: -58
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 1);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: 'JBL Flip 5' });
});

if (process.exitCode) {
  console.log('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll bluetooth tests passed');
}
