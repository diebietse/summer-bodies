// Run with: npm run ts ./examples/print-athletes.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import { Firestore } from "../src/firestore";
import { Format } from "../src/format";
import { Athlete } from "../src/challenge-models";

async function printAthletes() {
  const athletes = await Firestore.getRegisteredAthletes();
  ["Group 1", "Group 2"].forEach((club) => {
    const clubAthletes = athletes
      .filter((athlete) => athlete.club === club)
      .sort((a, b) => (fullName(a) > fullName(b) ? 1 : -1));
    console.log(Format.athletes(`Registered Athletes in '${club}'`, clubAthletes));
  });
}

function fullName(athlete: Athlete) {
  return `${athlete.firstname} ${athlete.lastname}`;
}

printAthletes();
