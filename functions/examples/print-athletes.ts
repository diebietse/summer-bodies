// Run with: npm run ts ./examples/print-athletes.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
// * Registered athletes in firestore

import { Firestore } from "../src/firestore";
import { Athlete } from "../src/challenge-models";

async function printAthletes() {
  const athletes = await Firestore.getRegisteredAthletes();
  const sortedAthletes = athletes.sort((a, b) => (fullName(a) > fullName(b) ? 1 : -1));
  console.table(sortedAthletes.map((athlete) => ({ name: fullName(athlete) })));

  console.log(`Total athletes: ${athletes.length}`);
}

function fullName(athlete: Athlete) {
  return `${athlete.firstname} ${athlete.lastname}`;
}

printAthletes();
