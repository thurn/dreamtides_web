// Strict ISO-8601 timestamp parsing for the battle reducer.
//
// `EventContext.timestamp` (== the appending event's `clientTimestamp`) is
// always stamped by `client.ts` as `new Date().toISOString()`, but a
// malformed or adversarial event could carry anything. `Date.parse` (and the
// `new Date(string)` constructor it backs) accepts a wide, IMPLEMENTATION- and
// LOCALE-DEPENDENT grab-bag of formats and silently returns `NaN` on failure
// rather than a value a reducer can branch on cleanly — a `NaN` staged into
// `nowMs` would poison every downstream stamp (e.g. a card note's
// `createdAtMs`) without ever bouncing the event, and worse, a runtime whose
// `Date.parse` accepts a format another runtime rejects could fold the SAME
// event to different `nowMs` values, breaking convergence (audit finding
// P3-3). `isoTimestampToMs` parses exactly the canonical
// `YYYY-MM-DDTHH:mm:ss(.sss)?Z` shape by hand (regex + `Date.UTC`), so its
// result is a pure, engine-independent function of the string.

const ISO_8601_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/**
 * Strict ISO-8601 (`YYYY-MM-DDTHH:mm:ss(.sss)?Z`) parse to epoch
 * milliseconds. Returns `null` (never `NaN`, never locale-dependent) on any
 * other input, including natural-language dates like `"July 8 2026"` and any
 * value `Date.UTC` would otherwise silently normalize (e.g. a 32nd day of the
 * month) — the round-trip check below rejects those.
 */
export function isoTimestampToMs(timestamp: string): number | null {
  const match = ISO_8601_UTC_PATTERN.exec(timestamp);
  if (match === null) {
    return null;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, msText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const milliseconds = msText === undefined ? 0 : Number(msText.padEnd(3, "0"));

  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  if (!Number.isFinite(epochMs)) {
    return null;
  }

  // `Date.UTC` NORMALIZES out-of-range components (month 13, day 32, ...)
  // instead of failing, so round-trip the computed instant back through its
  // UTC fields and reject any mismatch — the input was not actually a valid
  // calendar date/time.
  const roundTrip = new Date(epochMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    return null;
  }

  return epochMs;
}
