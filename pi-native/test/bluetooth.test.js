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
  assert.deepStrictEqual(devices.find((d) => d.mac === '11:22:33:44:55:66'), { mac: '11:22:33:44:55:66', name: 'JBL Flip 5', rssi: -60 });
  assert.deepStrictEqual(devices.find((d) => d.mac === 'AA:11:BB:22:CC:33'), { mac: 'AA:11:BB:22:CC:33', name: 'Pixel 7', rssi: null });
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
test('RSSI is captured and kept up to date as the strongest/latest reading', () => {
  // A real report: with several devices left MAC-only even after active
  // name resolution, there was no way to tell which one was the user's OWN
  // speaker vs. a neighbor's device - RSSI (closer to 0 = physically
  // closer) is the practical way to tell. Keep the LATEST reading, not the
  // first, since signal strength genuinely changes during a scan.
  const sample = `
[NEW] Device 11:22:33:44:55:66 JBL Flip 5
[CHG] Device 11:22:33:44:55:66 RSSI: -70
[CHG] Device 11:22:33:44:55:66 RSSI: -55
`;
  const devices = parseDeviceLines(sample);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: 'JBL Flip 5', rssi: -55 });
});
test('RSSI in "0x<hex> (-N)" form (a real bluetoothctl version\'s format) parses the real signed value, not the leading hex digit', () => {
  // A real report: RSSI showed as "0 dBm" for almost every device. This
  // BlueZ version formats it as "RSSI: 0xffffffbd (-67)" - the old regex
  // matched greedily from "RSSI: " and grabbed just the leading "0" of
  // "0xffffffbd" before the non-digit "x" stopped it.
  const sample = `
[NEW] Device 11:22:33:44:55:66 JBL Flip 5
[CHG] Device 11:22:33:44:55:66 RSSI: 0xffffffbd (-67)
`;
  const devices = parseDeviceLines(sample);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: 'JBL Flip 5', rssi: -67 });
});
test('a namespaced property key with a period ("ManufacturerData.Key: ...") does not become the device name', () => {
  // A real report: "ManufacturerData.Key: 0x3144 (12612)" showed up as a
  // device's name - a nested/namespaced property key isn't just
  // letters+spaces, so the earlier colon-based check still missed it.
  const sample = `
[CHG] Device 11:22:33:44:55:66 ManufacturerData.Key: 0x3144 (12612)
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 1);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: '11:22:33:44:55:66', rssi: null });
});
test('a "<Key> is nil"-phrased property line (no colon) does not become the device name', () => {
  // A real report: rows literally reading "RSSI is nil" / "TxPower is
  // nil" as the device name - this BlueZ/bluetoothctl version phrases an
  // unset property as "<Key> is nil", not "<Key>: value", so the
  // colon-based property-line check let it straight through as a name.
  const sample = `
[CHG] Device 11:22:33:44:55:66 RSSI is nil
[CHG] Device 11:22:33:44:55:66 TxPower is nil
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 1);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: '11:22:33:44:55:66', rssi: null });
});
test('a device whose FIRST captured line is a property update (not a name) falls back to its MAC, not the raw property text', () => {
  // A real report: the device list showed literal "RSSI: 0xffffffbd (-67)"
  // as a device's name. Happens when a device's "[NEW] Device MAC <name>"
  // line isn't in this particular scan's captured output at all (already
  // known/mid-discovery before capture started) - the old code adopted
  // whatever first "Device MAC ..." line it saw, property update or not.
  const sample = `
[CHG] Device 11:22:33:44:55:66 RSSI: -67
[CHG] Device 11:22:33:44:55:66 Connected: no
`;
  const devices = parseDeviceLines(sample);
  assert.strictEqual(devices.length, 1);
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: '11:22:33:44:55:66', rssi: -67 });
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
  assert.deepStrictEqual(devices[0], { mac: '11:22:33:44:55:66', name: 'JBL Flip 5', rssi: -58 });
});

if (process.exitCode) {
  console.log('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll bluetooth tests passed');
}
