export interface ContestantFitcoin {
  name: string;
  fitcoin: number;
}

export function compareContestantFitcoin(a: ContestantFitcoin, b: ContestantFitcoin) {
  if (a.fitcoin < b.fitcoin) return 1;
  if (a.fitcoin > b.fitcoin) return -1;
  return 0;
}