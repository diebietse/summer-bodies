// The end-of-challenge lucky draw. The snapshot is frozen (stored once, never overwritten) and its SHA-256
// fingerprint announced before the draw; the winners then follow deterministically from it and a drand beacon
// round that nobody can know in advance. website/src/draw/luckyDraw.js does the drawing - keep DRAW_ALGORITHM
// below in sync with it.

import moment from "moment";

// drand's "quicknet" beacon (League of Entropy): a new BLS-signed random value every 3 seconds.
// See https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/info
export const DRAND_QUICKNET = {
  beacon: "quicknet",
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesisTime: 1692803367,
  periodSeconds: 3,
};

export const DRAW_PRIZES_USD = [210, 110, 60, ...Array<number>(17).fill(20)];

export const DRAW_ALGORITHM = [
  "Each entry holds, for every week (and for the streak challenge, scored on its own), that FitCoin squared in tickets (the amounts are listed per entry), so a big week counts for more than two small ones.",
  "The ticket ranges below are numbered from 1 in entry order.",
  "The seed is the 'randomness' (hex) of the drand quicknet round named here, published at its round time.",
  "Draw k = 1, 2, 3, ...: ticket = (SHA-256 of the text '<seed>:<k>', read as a 256-bit unsigned big-endian number) mod totalTickets + 1.",
  "The ticket's holder wins the next prize, starting with 1st place; if they have already won, that draw is skipped and the next one is made.",
  "Drawing stops once every prize is won, or every entry has won something.",
].join(" ");

// FitCoin someone earned in one stored award, e.g. a week's results ("Mon Oct 04 2027") or the streak challenge
// ("streak-2027-10-04") - see Firestore.getFitcoinAwards.
export interface FitcoinAward {
  name: string;
  award: string;
  fitcoin: number;
}

export interface DrawEntry {
  name: string;
  fitcoin: number;
  // FitCoin per award - each week's results, then the streak challenge and any other one-off award.
  weeklyFitcoin: Record<string, number>;
  tickets: number;
  firstTicket: number;
  lastTicket: number;
}

export interface DrawSnapshot {
  version: 2;
  challenge: { startDate: string; endDate: string };
  createdAt: string;
  drand: { beacon: string; chainHash: string; round: number; roundTime: string };
  algorithm: string;
  prizes: { place: number; amountUsd: number }[];
  totalTickets: number;
  entries: DrawEntry[];
}

// A week's results award, labelled by its SAST Monday like "Mon Oct 05 2026" - see util.weekLabel.
const WEEK_AWARD = /^\w{3} \w{3} \d{2} \d{4}$/;

// Whether a stored FitCoin award belongs to the challenge running from `challenge.startDate` to `endDate`
// (inclusive "YYYY-MM-DD" dates). The fitcoin collection keeps every season's awards, so without this a returning
// athlete would carry last season's FitCoin into this season's totals and draw. Counts:
// * a week overlapping those dates, also with a prefix - e.g. the per-week streak awards before 2027,
//   "streak-Mon Oct 12 2026";
// * any other award with the challenge's start date in its name - the streak challenge's "streak-<startDate>", or a
//   one-off correction, which should be named "<what>-<startDate>" (e.g. "tie-fix-2027-10-04").
export function isChallengeAward(award: string, challenge: { startDate: string; endDate: string }): boolean {
  const week = awardWeek(award);
  if (!week) return award.includes(challenge.startDate);
  return week.format("YYYY-MM-DD") <= challenge.endDate && week.clone().add(6, "days").format("YYYY-MM-DD") >= challenge.startDate;
}

// Whether an award's name says which challenge it belongs to - a week, or a date. Firestore.getFitcoinAwards warns
// about any that doesn't, as it can never count (e.g. 2026's "tie-fix-weeks-1-3").
export function isDatedAward(award: string): boolean {
  return awardWeek(award) !== null || /\d{4}-\d{2}-\d{2}/.test(award);
}

// The Monday of a week award ("Mon Oct 05 2026", optionally after a "<something>-" prefix), or null.
function awardWeek(award: string): moment.Moment | null {
  const match = /(?:^|-)(\w{3} \w{3} \d{2} \d{4})$/.exec(award);
  const monday = match && moment.utc(match[1], "ddd MMM DD YYYY", true);
  return monday && monday.isValid() ? monday : null;
}

// Weeks in date order, then any other award by name.
function compareAwards(a: string, b: string): number {
  const weekTime = (award: string) => (WEEK_AWARD.test(award) ? Date.parse(award) : Infinity);
  const [timeA, timeB] = [weekTime(a), weekTime(b)];
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// The drand round published at `unixSeconds` (or the first one after it).
export function drandRoundAt(unixSeconds: number): number {
  return Math.ceil((unixSeconds - DRAND_QUICKNET.genesisTime) / DRAND_QUICKNET.periodSeconds) + 1;
}

export function drandRoundTime(round: number): number {
  return DRAND_QUICKNET.genesisTime + (round - 1) * DRAND_QUICKNET.periodSeconds;
}

// Entries are in name order (rather than shuffled) so the ticket ranges follow a rule anyone can check; athletes
// with no FitCoin hold no tickets and are left out. Weekly FitCoin is squared rather than summed so the people
// who commit hardest get a better chance, while someone who joins late is only short the weeks they missed.
export function buildDrawSnapshot(
  awards: FitcoinAward[],
  challenge: { startDate: string; endDate: string },
  drawUnixSeconds: number,
  createdAt: Date,
): DrawSnapshot {
  const weeklyByName = new Map<string, Map<string, number>>();
  for (const { name, award, fitcoin } of awards) {
    const weekly = weeklyByName.get(name) ?? new Map<string, number>();
    weekly.set(award, (weekly.get(award) ?? 0) + fitcoin);
    weeklyByName.set(name, weekly);
  }

  const entries: DrawEntry[] = [];
  let lastTicket = 0;
  for (const name of [...weeklyByName.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const weeks = [...weeklyByName.get(name)!].filter(([, fitcoin]) => fitcoin > 0).sort(([a], [b]) => compareAwards(a, b));
    const tickets = weeks.reduce((sum, [, fitcoin]) => sum + fitcoin * fitcoin, 0);
    if (tickets === 0) continue;
    const fitcoin = weeks.reduce((sum, [, weekFitcoin]) => sum + weekFitcoin, 0);
    entries.push({ name, fitcoin, weeklyFitcoin: Object.fromEntries(weeks), tickets, firstTicket: lastTicket + 1, lastTicket: lastTicket + tickets });
    lastTicket += tickets;
  }

  const round = drandRoundAt(drawUnixSeconds);
  return {
    version: 2,
    challenge,
    createdAt: createdAt.toISOString(),
    drand: {
      beacon: DRAND_QUICKNET.beacon,
      chainHash: DRAND_QUICKNET.chainHash,
      round,
      roundTime: new Date(drandRoundTime(round) * 1000).toISOString(),
    },
    algorithm: DRAW_ALGORITHM,
    prizes: DRAW_PRIZES_USD.map((amountUsd, index) => ({ place: index + 1, amountUsd })),
    totalTickets: lastTicket,
    entries,
  };
}
