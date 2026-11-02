// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { fitcoinRows, topRows } from "./fitcoinTable.js";

test("fitcoinRows merges each person's week, streak and total, highest total first", () => {
  const rows = fitcoinRows({
    week: [{ name: "Alex", fitcoin: 10 }],
    streak: [{ name: "Blake", fitcoin: 28 }],
    total: [
      { name: "Alex", fitcoin: 40 },
      { name: "Blake", fitcoin: 90 },
    ],
  });

  assert.deepEqual(rows, [
    { name: "Blake", week: 0, streak: 28, total: 90, rank: 1 },
    { name: "Alex", week: 10, streak: 0, total: 40, rank: 2 },
  ]);
});

test("fitcoinRows ranks ties alike, by name within the tie", () => {
  const total = [
    { name: "Casey", fitcoin: 30 },
    { name: "Blake", fitcoin: 50 },
    { name: "Alex", fitcoin: 50 },
    { name: "Drew", fitcoin: 10 },
  ];

  assert.deepEqual(
    fitcoinRows({ week: [], total }).map((row) => `${row.rank} ${row.name}`),
    ["1 Alex", "1 Blake", "3 Casey", "4 Drew"],
  );
});

test("topRows keeps everyone tied with the last position shown", () => {
  const rows = fitcoinRows({ week: [], total: ["A", "B", "C", "D"].map((name, i) => ({ name, fitcoin: i < 3 ? 10 : 5 })) });

  assert.deepEqual(
    topRows(rows, 2).map((row) => row.name),
    ["A", "B", "C"],
  );
});
