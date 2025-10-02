import moment from "moment";

export async function waitMilliseconds(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function now(): number {
  let now = moment.utc();
  return now.unix();
}

export function nowPretty(): string {
  let now = moment.utc();
  return `${now.format("YYYY-MM-DD HH:mm:ss")} UTC`;
}

export function lastWeekPretty(): string {
  let now = moment.utc();
  return `${now.clone().subtract(7, "days").startOf("isoWeek").format("YYYY-MM-DD")} - ${now
    .startOf("isoWeek")
    .format("YYYY-MM-DD")}`;
}

export function getCurrentWeek(): Date {
  let now = moment.utc();
  return now.startOf("isoWeek").toDate();
}

export function getPreviousWeek(): Date {
  let now = moment.utc();
  const lastWeek = now.subtract(7, "days");
  return lastWeek.startOf("isoWeek").toDate();
}

export function weeksAgo(weeksAgo: number): moment.Moment {
  let now = moment.utc();
  const lastWeek = now.subtract(weeksAgo, "weeks");
  return lastWeek.startOf("isoWeek");
}

export function weeksAgoUnix(weeksAgo: number): number {
  let now = moment.utc();
  const lastWeek = now.subtract(weeksAgo, "weeks");
  return lastWeek.startOf("isoWeek").unix();
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
