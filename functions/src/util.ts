import moment from "moment";

export async function waitMilliseconds(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// The challenge runs on South African time (the schedulers in index.ts are Africa/Johannesburg too), so weeks
// start Monday 00:00 SAST and "today" rolls over at midnight SAST. SAST is UTC+2 all year (no DST), so a fixed
// offset is exact.
const CHALLENGE_UTC_OFFSET_MINUTES = 120;

function challengeTime(at: moment.Moment = moment.utc()): moment.Moment {
  return at.clone().utcOffset(CHALLENGE_UTC_OFFSET_MINUTES);
}

export function now(): number {
  return moment.utc().unix();
}

export function nowPretty(): string {
  return `${challengeTime().format("YYYY-MM-DD HH:mm:ss")} SAST`;
}

export function lastWeekPretty(): string {
  return `${weeksAgo(1).format("YYYY-MM-DD")} - ${weeksAgo(0).format("YYYY-MM-DD")}`;
}

// Labels a week's stored fitcoin docs by its SAST Monday (e.g. "Mon Oct 05 2026"), whatever the server's timezone.
// The format matches Date.toDateString(), which existing docs were keyed by, so re-running an old week overwrites
// its doc instead of adding a second one that would double-count in the totals.
export function weekLabel(at: moment.Moment): string {
  return challengeTime(at).startOf("isoWeek").format("ddd MMM DD YYYY");
}

export function previousWeekLabel(): string {
  return weekLabel(weeksAgo(1));
}

// The last SAST calendar date ("YYYY-MM-DD") of the week before the one containing `at` - i.e. the Sunday whose
// week the weekly job running at `at` (Mondays) has just evaluated.
export function lastDayOfPreviousWeek(at: moment.Moment): string {
  return weeksAgo(0, at).subtract(1, "day").format("YYYY-MM-DD");
}

// Start (Monday 00:00 SAST) of the challenge week `weeks` weeks before `at` (default: now).
export function weeksAgo(weeks: number, at?: moment.Moment): moment.Moment {
  return challengeTime(at).subtract(weeks, "weeks").startOf("isoWeek");
}

export function weeksAgoUnix(weeks: number, at?: moment.Moment): number {
  return weeksAgo(weeks, at).unix();
}

export function previousWeekUnix(): number {
  return weeksAgoUnix(1);
}

export function currentWeekUnix(): number {
  return weeksAgoUnix(0);
}

export function nextWeekUnix(): number {
  return weeksAgoUnix(-1);
}

// Start of today (SAST) - the exclusive upper bound of "every day so far", since today isn't over yet.
export function todayUnix(): number {
  return challengeTime().startOf("day").unix();
}

// Every SAST calendar date ("YYYY-MM-DD") from `startUnix` (inclusive) up to `endUnixExclusive` (exclusive).
export function weekDateStrings(startUnix: number, endUnixExclusive: number): string[] {
  const dates: string[] = [];
  const cursor = challengeTime(moment.unix(startUnix));
  const end = challengeTime(moment.unix(endUnixExclusive));
  while (cursor.isBefore(end)) {
    dates.push(cursor.format("YYYY-MM-DD"));
    cursor.add(1, "day");
  }
  return dates;
}

// https://stackoverflow.com/a/2450976
// Fisher–Yates shuffle https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
export function shuffle(array: any[]): any[] {
  let currentIndex = array.length;

  // While there remain elements to shuffle.
  while (currentIndex > 0) {
    // Pick a remaining element.
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
