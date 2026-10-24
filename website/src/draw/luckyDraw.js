// The lucky draw itself: turns a frozen snapshot (see functions/src/draw.ts, which states this same algorithm in
// the snapshot's "algorithm" text) and a drand beacon into winners. Runs in the browser (views/Draw.vue) and in
// Node (scripts/verify-draw.mjs), so anyone can re-run it and get the same result.
import { HttpCachingChain, HttpChainClient, fetchBeacon } from "drand-client";

// drand "quicknet" (League of Entropy). The public key is what the beacon's BLS signature is checked against, so
// a relay can't hand us a made-up value.
export const DRAND_QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey: "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  relays: ["https://api.drand.sh", "https://drand.cloudflare.com"],
};

export function drandRoundUrl(round, relay = DRAND_QUICKNET.relays[0]) {
  return `${relay}/${DRAND_QUICKNET.chainHash}/public/${round}`;
}

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The SHA-256 fingerprint of the snapshot's exact text, as announced before the draw.
export function snapshotFingerprint(snapshotText) {
  return sha256Hex(snapshotText);
}

// Fetches the round from the first relay that answers, with its BLS signature verified against the quicknet
// public key - throws if the round isn't out yet or doesn't verify.
export async function fetchVerifiedBeacon(round) {
  const options = { disableBeaconVerification: false, noCache: false, chainVerificationParams: { chainHash: DRAND_QUICKNET.chainHash, publicKey: DRAND_QUICKNET.publicKey } };
  let lastError;
  for (const relay of DRAND_QUICKNET.relays) {
    try {
      const chain = new HttpCachingChain(`${relay}/${DRAND_QUICKNET.chainHash}`, options);
      return { ...(await fetchBeacon(new HttpChainClient(chain, options), round)), relay };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Draw k: SHA-256("<randomness>:<k>") as a 256-bit number, mod totalTickets, + 1. With 2^256 possible values and a
// few thousand tickets the modulo bias is far too small to matter (around 1 in 10^73).
async function ticketForDraw(randomness, k, totalTickets) {
  return Number(BigInt(`0x${await sha256Hex(`${randomness}:${k}`)}`) % BigInt(totalTickets)) + 1;
}

function holderOf(entries, ticket) {
  return entries.find((entry) => ticket >= entry.firstTicket && ticket <= entry.lastTicket);
}

// Every draw made, in order ({ draw, ticket, name, place } - place is null for a skipped repeat), and the winners
// in prize order (1st place first).
export async function drawWinners(snapshot, randomness) {
  const steps = [];
  const winners = [];
  const won = new Set();
  const maxWinners = Math.min(snapshot.prizes.length, snapshot.entries.length);
  for (let k = 1; winners.length < maxWinners; k++) {
    const ticket = await ticketForDraw(randomness, k, snapshot.totalTickets);
    const { name } = holderOf(snapshot.entries, ticket);
    if (won.has(name)) {
      steps.push({ draw: k, ticket, name, place: null });
      continue;
    }
    won.add(name);
    const prize = snapshot.prizes[winners.length];
    winners.push({ ...prize, name, ticket, draw: k });
    steps.push({ draw: k, ticket, name, place: prize.place });
  }
  return { steps, winners };
}
