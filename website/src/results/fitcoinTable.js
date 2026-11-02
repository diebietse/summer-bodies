// The results page's FitCoin tab (views/Results.vue), from a results doc's `fitcoin` (see ChallengeResults in
// functions/src/challenge-models.ts).

// One row per person with a total, ranked by total and then name. Ties share a position ("1, 2, 2, 4"), like FitCoin
// itself does.
export function fitcoinRows(fitcoin) {
  const byName = (list) => new Map((list ?? []).map((c) => [c.name, c.fitcoin]));
  const [week, streak] = [byName(fitcoin.week), byName(fitcoin.streak)];
  const rows = fitcoin.total.map((c) => ({ name: c.name, week: week.get(c.name) ?? 0, streak: streak.get(c.name) ?? 0, total: c.fitcoin })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((row, index) => (row.rank = index > 0 && rows[index - 1].total === row.total ? rows[index - 1].rank : index + 1));
  return rows;
}

// The rows ranked `maxRank` or better - including everyone tied with that position.
export function topRows(rows, maxRank) {
  return rows.filter((row) => row.rank <= maxRank);
}
