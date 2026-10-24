// Independently re-runs the lucky draw: node scripts/verify-draw.mjs <snapshot.json | the /draw link>
// Given the link, it downloads the snapshot from the API. Prints the snapshot's SHA-256 fingerprint (compare
// it with the one announced before the draw), checks the drand beacon's signature, and lists the winners - which
// must match the /draw page.
import { readFileSync } from "node:fs";
import { drawWinners, fetchVerifiedBeacon, snapshotFingerprint } from "../src/draw/luckyDraw.js";
import { API_BASE_URL } from "../src/apiBase.js";

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: node scripts/verify-draw.mjs <snapshot.json | the /draw link>");
  const linkId = /\/draw\/([0-9a-f-]{36})\b/.exec(source)?.[1];
  let text;
  if (linkId) {
    const response = await fetch(`${API_BASE_URL}/draw/${linkId}`);
    if (!response.ok) throw new Error(`No lucky draw at that link (HTTP ${response.status})`);
    text = await response.text();
  } else text = readFileSync(source, "utf8");
  const snapshot = JSON.parse(text);

  console.log(`Snapshot fingerprint (SHA-256): ${await snapshotFingerprint(text)}`);
  console.log(`${snapshot.entries.length} entries, ${snapshot.totalTickets} tickets, ${snapshot.prizes.length} prizes`);
  console.log(`drand ${snapshot.drand.beacon} round ${snapshot.drand.round} (${snapshot.drand.roundTime})`);

  const beacon = await fetchVerifiedBeacon(snapshot.drand.round);
  console.log(`Beacon signature verified via ${beacon.relay}, randomness ${beacon.randomness}\n`);

  const { steps, winners } = await drawWinners(snapshot, beacon.randomness);
  for (const step of steps) {
    console.log(`Draw ${step.draw}: ticket ${step.ticket} -> ${step.name}${step.place ? ` wins place ${step.place}` : " (already won, skipped)"}`);
  }
  console.log("\nWinners:");
  for (const winner of winners) console.log(`${winner.place}. ${winner.name} - $${winner.amountUsd}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
