// Persisted Timer ("alarm") list, with the same load/save/validate-with-
// fallback pattern as panelConfig.js. Entry fields: id, name, enabled, hour,
// minute, repeat ('once'|'daily'|'weekdays'|'weekends'|'weekly'|'hourly'), days
// (weekly, 0=Sun), triggerType ('effect'|'playlist'; playlists not implemented),
// effect, overlayKeys, message, prealarm {enabled, preMinutes, startBright,
// giantSun, windDown, wdMinutes, wdUseEffect, wdEffectKey, wdOverlayKeys}, and
// _lastFireMin (de-dupe guard used by alarmEngine.js's alarmCheck).
const fs = require('fs');
const { readSectionJson, writeSection } = require('./settingsStore'); // CONFIG_PATH is now only the pre-settings.json legacy file, imported once
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
  if (al.triggerType !== undefined && !['effect', 'playlist', 'scene', 'off'].includes(al.triggerType)) return false;
  if (al.overlayKeys !== undefined && !Array.isArray(al.overlayKeys)) return false;
  return true;
}

function load() {
  try {
    const raw = readSectionJson('alarms', CONFIG_PATH);
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
  writeSection('alarms', alarms);
}

module.exports = { load, save, isValidAlarm, REPEAT_MODES, CONFIG_PATH };
