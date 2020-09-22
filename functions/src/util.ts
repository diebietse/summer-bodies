import moment from "moment";

export async function waitMilliseconds(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
