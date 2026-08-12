// Persisted Timer ("alarm") list, mirroring panelConfig.js's exact
// load()/save()/validate-on-load-with-fallback-to-default pattern - see
// that file's module comment for why (survive a restart, JSON file on disk
// next to this one, gitignored). Ported from the browser's alarmLoad()/
// alarmSave() (ui.js ~line 291-293), which used localStorage - there's no
// browser/localStorage on the Pi side, so this is the on-disk equivalent.
//
// Data model (one entry in the `alarms` array) - the editor modal
// (#alarm-modal in index.html) is the ground truth for every field, per
// the porting task's own instruction to read it over the terser inline
// default object in ui.js's alarmOpenEditor():
//   {
//     id,                          // string, assigned on create, stable identity for updateAlarm/deleteAlarm/setAlarmEnabled/dismiss-matching
//     name, enabled,                // bool
//     hour (0-23), minute (0-59),
//     repeat: 'once'|'daily'|'weekdays'|'weekends'|'weekly'|'hourly',
//     days: [0-6],                  // only meaningful for repeat:'weekly' (0=Sun)
//     triggerType: 'effect'|'playlist',
//     effect,                       // effect key, only used when triggerType==='effect'
//     overlayKeys: [],              // overlay keys forced on when this alarm fires
//     playlistName,                 // kept for shape-fidelity with the browser; playlists
//                                    // are NOT implemented in pi-native (see alarmEngine.js's
//                                    // module comment) - a playlist-type alarm falls back to
//                                    // the same "no effect" handling alarmFire()'s own
//                                    // else-branch already has, same as cam.js/fireworks.js/
//                                    // video.js's own out-of-scope pieces.
//     message,                      // text shown on the cube during the main alarm phase
//     prealarm: {
//       enabled,                    // pre-alarm dim->bright ramp
//       preMinutes, startBright,    // ramp window length (mins) / starting brightness (%)
//       giantSun,                   // use renderGiantSun instead of renderAlarmSunrise
//       windDown,                   // this alarm is a Wind Down (dims forward from full,
//                                    // starting AT alarm time) instead of a wake alarm
//       wdMinutes,                  // wind-down duration (mins)
//       wdUseEffect, wdEffectKey, wdOverlayKeys,  // run an effect (dimming) instead of the plain wind-down sky
//     },
//     _lastFireMin,                 // transient de-dupe guard (see alarmEngine.js's alarmCheck) - persisted
//                                    // verbatim like the browser does (alarmSave() saves the whole object).
//   }
//
// effectRise (an alarm-time "wake into a live effect like weather/radio"
// mode from the browser source) is a documented, permanent scope boundary,
// NOT ported - see alarmEngine.js's module comment for why.
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'alarms.json');
const REPEAT_MODES = ['once', 'daily', 'weekdays', 'weekends', 'weekly', 'hourly'];

function isValidAlarm(al) {
  if (!al || typeof al !== 'object') return false;
  if (typeof al.id !== 'string' || !al.id) return false;
  if (!Number.isInteger(al.hour) || al.hour < 0 || al.hour > 23) return false;
  if (!Number.isInteger(al.minute) || al.minute < 0 || al.minute > 59) return false;
  if (!REPEAT_MODES.includes(al.repeat)) return false;
  if (al.days !== undefined && (!Array.isArray(al.days) || al.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) return false;
  if (al.triggerType !== undefined && al.triggerType !== 'effect' && al.triggerType !== 'playlist') return false;
  if (al.overlayKeys !== undefined && !Array.isArray(al.overlayKeys)) return false;
  return true;
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid stored alarms');
    return parsed.filter(isValidAlarm);
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to an empty
    // list rather than crashing the app over a config file, same spirit as
    // panelConfig.load()'s catch branch.
    return [];
  }
}

function save(alarms) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(alarms, null, 2));
}

module.exports = { load, save, isValidAlarm, REPEAT_MODES, CONFIG_PATH };
