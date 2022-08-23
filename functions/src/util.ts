import moment from "moment";

export async function waitMilliseconds(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function now(): number {
  let now = moment.utc();
  return now.unix();
}

export function getCurrentWeek(): Date {
  let now = moment.utc();
  return now.startOf("isoWeek").toDate();
}

export function getCurrentWeekUnix(): number {
  let now = moment.utc();
  return now.startOf("isoWeek").unix();
}

export function getPreviousWeek(): Date {
  let now = moment.utc();
  const lastWeek = now.subtract(7, "days");
  return lastWeek.startOf("isoWeek").toDate();
}

export function getPreviousWeekUnix(): number {
  let now = moment.utc();
  const lastWeek = now.subtract(7, "days");
  return lastWeek.startOf("isoWeek").unix();
}
