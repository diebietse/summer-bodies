// Strava activity and athlete ids become 64-bit integers from 2027-06-01. A JS number is exact only up to 2^53, so
// JSON.parse would silently round a bigger id to a neighbouring one - fetching, storing or deleting the wrong
// activity, with nothing ever throwing. So ids are read as strings, straight from the JSON text: the reviver's
// `source` (Node 21+) is the raw number as written, before it became a double. Strava also sends `id_str` on
// activities and athletes, but not on webhook events, so this one rule covers both.

// The property names holding activity/athlete ids: `id` in Strava API responses, `object_id`/`owner_id` in webhook
// events. Not `subscription_id`, which stays a number (it's compared with the stored subscription id).
export const STRAVA_ID_KEYS: ReadonlySet<string> = new Set(["id", "object_id", "owner_id"]);

// A JSON.parse reviver turning every numeric value under one of `keys` into its exact digits as a string.
export function stringIdReviver(keys: ReadonlySet<string> = STRAVA_ID_KEYS) {
  return (key: string, value: unknown, context?: { source?: string }): unknown =>
    keys.has(key) && typeof value === "number" && context?.source !== undefined ? context.source : value;
}

export function parseJsonWithStringIds(text: string, keys?: ReadonlySet<string>): unknown {
  return JSON.parse(text, stringIdReviver(keys));
}

// Orders id strings as the numbers they are (digits only, no leading zeros): shorter is smaller, then digit by digit.
export function compareStravaIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

// Whether `value` is an id as stravaIds parses one: the digits of a non-negative integer.
export function isStravaId(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}
