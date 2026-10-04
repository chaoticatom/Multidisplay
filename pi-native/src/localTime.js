// The user's local time, whatever the Pi's own clock zone is. A Raspberry
// Pi is often left on UTC, so a 07:00 timer set from a phone in the UK
// fired an hour off (a real report: "nothing showing" at the set time).
// The page tells the Pi its time zone (prefs.tz, an IANA name such as
// "Europe/London"); timers, the day plan, celebrations and night dimming
// all read the clock through here.
//   wallClock(tz) -> a Date whose getHours()/getDay()/toDateString()... give
//   the time in tz. getTime()/valueOf() stay the real instant, so durations
//   (now - start) are unaffected.
'use strict';

function isZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (e) { return false; }
}

const fmtCache = new Map();
function wallClock(tz, real = new Date()) {
  if (!isZone(tz)) return real;
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    fmtCache.set(tz, fmt);
  }
  const p = {};
  for (const part of fmt.formatToParts(real)) p[part.type] = Number(part.value);
  // A Date built from the wall-clock parts in the Pi's zone: its getters read
  // as the user's local time.
  const wall = new Date(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second, real.getMilliseconds());
  const t = real.getTime();
  wall.getTime = () => t;
  wall.valueOf = () => t;
  return wall;
}

module.exports = { wallClock, isZone };
