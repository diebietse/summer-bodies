import { ContestantFitcoin } from "./challenge-models";

// The end-of-challenge lucky draw. The snapshot is frozen (stored once, never overwritten) and its SHA-256
// fingerprint announced before the draw; the winners then follow deterministically from it and a drand beacon
// round that nobody can know in advance. website/src/draw/luckyDraw.js does the drawing - keep DRAW_ALGORITHM
// below in sync with it.

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
  "Each entry holds one ticket per FitCoin: the ticket ranges below, numbered from 1 in entry order.",
  "The seed is the 'randomness' (hex) of the drand quicknet round named here, published at its round time.",
  "Draw k = 1, 2, 3, ...: ticket = (SHA-256 of the text '<seed>:<k>', read as a 256-bit unsigned big-endian number) mod totalTickets + 1.",
  "The ticket's holder wins the next prize, starting with 1st place; if they have already won, that draw is skipped and the next one is made.",
  "Drawing stops once every prize is won, or every entry has won something.",
].join(" ");

export interface DrawEntry {
  name: string;
  fitcoin: number;
  firstTicket: number;
  lastTicket: number;
}

export interface DrawSnapshot {
  version: 1;
  challenge: { startDate: string; endDate: string };
  createdAt: string;
  drand: { beacon: string; chainHash: string; round: number; roundTime: string };
  algorithm: string;
  prizes: { place: number; amountUsd: number }[];
  totalTickets: number;
  entries: DrawEntry[];
}

// The drand round published at `unixSeconds` (or the first one after it).
export function drandRoundAt(unixSeconds: number): number {
  return Math.ceil((unixSeconds - DRAND_QUICKNET.genesisTime) / DRAND_QUICKNET.periodSeconds) + 1;
}

export function drandRoundTime(round: number): number {
  return DRAND_QUICKNET.genesisTime + (round - 1) * DRAND_QUICKNET.periodSeconds;
}

// Entries are in name order (rather than shuffled) so the ticket ranges follow a rule anyone can check; athletes
// with no FitCoin hold no tickets and are left out.
export function buildDrawSnapshot(
  totals: ContestantFitcoin[],
  challenge: { startDate: string; endDate: string },
  drawUnixSeconds: number,
  createdAt: Date,
): DrawSnapshot {
  const entries: DrawEntry[] = [];
  let lastTicket = 0;
  for (const { name, fitcoin } of [...totals].filter((t) => t.fitcoin > 0).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    entries.push({ name, fitcoin, firstTicket: lastTicket + 1, lastTicket: lastTicket + fitcoin });
    lastTicket += fitcoin;
  }

  const round = drandRoundAt(drawUnixSeconds);
  return {
    version: 1,
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
