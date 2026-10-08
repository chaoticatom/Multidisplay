// Setup > Bluetooth > Range: picking the speaker's codec profile
// (src/bluetooth.js parseBtCards / pickProfile).
'use strict';
const assert = require('assert');
const { parseBtCards, pickProfile } = require('../src/bluetooth');
console.log('btRange');

const PIPEWIRE = `Card #45
	Name: alsa_card.platform-bcm2835_audio
	Profiles:
		output:analog-stereo: Analog Stereo Output (sinks: 1, sources: 0, priority: 6500, available: yes)
	Active Profile: output:analog-stereo
Card #57
	Name: bluez_card.F4_4E_FD_11_22_33
	Driver: module-bluez5-device.c
	Profiles:
		off: Off (sinks: 0, sources: 0, priority: 0, available: yes)
		a2dp-sink-sbc: High Fidelity Playback (A2DP Sink, codec SBC) (sinks: 1, sources: 0, priority: 18, available: yes)
		a2dp-sink-sbc_xq: High Fidelity Playback (A2DP Sink, codec SBC-XQ) (sinks: 1, sources: 0, priority: 19, available: yes)
		a2dp-sink-aac: High Fidelity Playback (A2DP Sink, codec AAC) (sinks: 1, sources: 0, priority: 20, available: no)
		headset-head-unit: Headset Head Unit (HSP/HFP) (sinks: 1, sources: 1, priority: 1, available: yes)
	Active Profile: a2dp-sink-sbc_xq
	Ports:
		speaker-output: Speaker (type: Speaker, priority: 0, available)
`;
const PULSE = `Card #1
	Name: bluez_card.F4_4E_FD_11_22_33
	Profiles:
		a2dp_sink: High Fidelity Playback (A2DP Sink) (sinks: 1, sources: 0, priority: 40, available: yes)
		off: Off (sinks: 0, sources: 0, priority: 0, available: yes)
	Active Profile: a2dp_sink
`;
try {
  const cards = parseBtCards(PIPEWIRE);
  assert.strictEqual(cards.length, 1, 'only the Bluetooth card');
  assert.strictEqual(cards[0].active, 'a2dp-sink-sbc_xq');
  assert.strictEqual(cards[0].profiles.length, 5);
  assert.strictEqual(pickProfile(cards[0].profiles, 'long'), 'a2dp-sink-sbc');
  assert.strictEqual(pickProfile(cards[0].profiles, 'normal'), 'a2dp-sink-sbc_xq', 'AAC is unavailable, so the next best');
  console.log('  ok - long range picks plain SBC; normal the best available codec');
  const old = parseBtCards(PULSE);
  assert.strictEqual(pickProfile(old[0].profiles, 'long'), 'a2dp_sink');
  assert.strictEqual(pickProfile(old[0].profiles, 'normal'), null, 'nothing to choose on older PulseAudio');
  assert.deepStrictEqual(parseBtCards(''), []);
  console.log('  ok - older PulseAudio and no speaker are handled');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
