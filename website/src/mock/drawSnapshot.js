// Made-up lucky draw snapshots for the local preview (views/DrawPreview.vue). mockDrawSnapshot has the shape
// 2026's create-draw-snapshot.ts stored (version 1, one ticket per FitCoin); mockDrawSnapshotV2 the shape it stores
// now (version 2, each award's FitCoin squared). Round 33313174 is a real, already published drand round, so
// the preview's draw runs against a genuine beacon. Some of its winners (1st, 2nd, 4th, 5th and 20th) have
// deliberately long names, to check they fit the reveal (in the version 1 snapshot - version 2's tickets differ, so
// its winners do too).
const FITCOIN = {
  "Alex Carter": 94,
  "Casey Montgomery-Fitzgerald": 41,
  "Drew Janse van Rensburg": 12,
  "Eloise Bezuidenhout-Smith": 67,
  "Frankie Botha": 23,
  "Jamie Lee": 88,
  "Jordan Blake": 35,
  "Kai Naidoo": 77,
  "Lee van Wyk": 8,
  "Morgan Reyes": 85,
  "Nico Dlamini": 54,
  "Parker van der Westhuizen": 19,
  "Quinn Adams": 62,
  "Riley Cohen": 30,
  "Robin Oosthuizen-Pretorius": 71,
  "Sam Jacobs": 46,
  "Sky Ndlovu": 15,
  "Taylor Brooks": 59,
  "Toni Fourie": 27,
  "Val Khumalo": 50,
  "Wren Daniels": 38,
  "Yael Nel": 64,
  "Zan Govender": 9,
  "Zola Meyer": 44,
};

let lastTicket = 0;
const entries = Object.entries(FITCOIN).map(([name, fitcoin]) => {
  const entry = { name, fitcoin, firstTicket: lastTicket + 1, lastTicket: lastTicket + fitcoin };
  lastTicket += fitcoin;
  return entry;
});

export const mockDrawSnapshot = {
  version: 1,
  challenge: { startDate: "2026-10-05", endDate: "2026-11-01" },
  createdAt: "2026-11-02T10:00:00.000Z",
  drand: {
    beacon: "quicknet",
    chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    round: 33313174,
    roundTime: "2026-10-23T08:08:06.000Z",
  },
  algorithm:
    "Each entry holds one ticket per FitCoin: the ticket ranges below, numbered from 1 in entry order. The seed is the 'randomness' (hex) of the drand quicknet round named here, published at its round time. Draw k = 1, 2, 3, ...: ticket = (SHA-256 of the text '<seed>:<k>', read as a 256-bit unsigned big-endian number) mod totalTickets + 1. The ticket's holder wins the next prize, starting with 1st place; if they have already won, that draw is skipped and the next one is made. Drawing stops once every prize is won, or every entry has won something.",
  prizes: [210, 110, 60, ...Array(17).fill(20)].map((amountUsd, index) => ({ place: index + 1, amountUsd })),
  totalTickets: lastTicket,
  entries,
};

// Each entry's FitCoin split over the four weeks, plus a streak challenge award for some - tickets are the sum of
// each award's FitCoin squared, as functions/src/draw.ts works them out.
const WEEKS = ["Mon Oct 05 2026", "Mon Oct 12 2026", "Mon Oct 19 2026", "Mon Oct 26 2026"];
let lastTicketV2 = 0;
const entriesV2 = Object.entries(FITCOIN).map(([name, fitcoin], index) => {
  const streak = index % 3 === 0 ? Math.min(28, Math.floor(fitcoin / 3)) : 0;
  const weekly = fitcoin - streak;
  // A late starter (every fifth entry) only has the last two weeks.
  const weeks = index % 5 === 4 ? WEEKS.slice(2) : WEEKS;
  const weeklyFitcoin = Object.fromEntries(weeks.map((week, i) => [week, Math.floor(weekly / weeks.length) + (i < weekly % weeks.length ? 1 : 0)]));
  if (streak > 0) weeklyFitcoin["streak-2026-10-05"] = streak;
  const tickets = Object.values(weeklyFitcoin).reduce((sum, value) => sum + value * value, 0);
  const entry = { name, fitcoin, weeklyFitcoin, tickets, firstTicket: lastTicketV2 + 1, lastTicket: lastTicketV2 + tickets };
  lastTicketV2 += tickets;
  return entry;
});

export const mockDrawSnapshotV2 = {
  ...mockDrawSnapshot,
  version: 2,
  algorithm:
    "Each entry holds, for every week (and for the streak challenge, scored on its own), that FitCoin squared in tickets (the amounts are listed per entry), so a big week counts for more than two small ones. The ticket ranges below are numbered from 1 in entry order. The seed is the 'randomness' (hex) of the drand quicknet round named here, published at its round time. Draw k = 1, 2, 3, ...: ticket = (SHA-256 of the text '<seed>:<k>', read as a 256-bit unsigned big-endian number) mod totalTickets + 1. The ticket's holder wins the next prize, starting with 1st place; if they have already won, that draw is skipped and the next one is made. Drawing stops once every prize is won, or every entry has won something.",
  totalTickets: lastTicketV2,
  entries: entriesV2,
};
