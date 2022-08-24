import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { ContestantFitcoin, compareContestantFitcoin, Athlete } from "./challenge-models";
import moment from "moment";
import { TokenFromCodeResponse } from "./strava";

// service-account.json in the root directory of the project
const CUSTOM_SERVICE_ACCOUNT = path.resolve(__dirname, "../../service-account.json");

if (fs.existsSync(CUSTOM_SERVICE_ACCOUNT)) {
  // If custom service account exists in expected place, use it
  console.log(`Using custom service account: ${CUSTOM_SERVICE_ACCOUNT}`);
  admin.initializeApp({ credential: admin.credential.cert(CUSTOM_SERVICE_ACCOUNT) });
} else {
  // If no custom service account exists this is deployed on GCP and googles sets it for us
  admin.initializeApp();
}

const db = admin.firestore();
const configRef = db.collection("config").doc("config");

export class Firestore {
  static async getConfig(): Promise<SummerBodiesConfig> {
    const doc = (await configRef.get()).data();
    return doc as SummerBodiesConfig;
  }

  static async updateRefreshToken(stravaRefreshToken: string) {
    await configRef.update({ stravaRefreshToken });
  }

  static async uploadConfig(config: SummerBodiesConfig) {
    configRef.set(config);
  }

  static async storeFitcoin(fitcoinsContestants: ContestantFitcoin[], date: Date): Promise<void> {
    const collection = db.collection("fitcoin").doc(date.toDateString()).collection("athletes");
    fitcoinsContestants.forEach((contestant) => {
      collection.doc(contestant.name).set({ fitcoin: contestant.fitcoin });
    });
  }

  static async getFitcoinTotals(): Promise<ContestantFitcoin[]> {
    const collection = db.collection("fitcoin");
    const docs = await collection.listDocuments();
    let contestants = new Map<string, number>();
    for (const doc of docs) {
      const athletes = await doc.collection("athletes").listDocuments();
      for (const athlete of athletes) {
        const data = (await athlete.get()).data();
        let total = contestants.get(athlete.id) || 0;
        total += data?.fitcoin;
        contestants.set(athlete.id, total);
      }
    }
    let res: ContestantFitcoin[] = [];
    contestants.forEach((fitcoin, name) => {
      const athlete: ContestantFitcoin = {
        name: name,
        fitcoin: fitcoin,
      };
      res.push(athlete);
    });
    return res.sort(compareContestantFitcoin);
  }

  static async storeBackup(dataSnapshot: string) {
    const doc = db.collection("backups").doc(moment.utc().toISOString());
    await doc.create({ dataSnapshot });
  }

  static async getRegisteredAthletes(): Promise<Athlete[]> {
    const collection = db.collection("athletes");
    const athletes = await collection.listDocuments();
    let res: Athlete[] = [];
    for (const athlete of athletes) {
      const data = (await athlete.get()).data();
      res.push(data as Athlete);
    }

    return res;
  }

  static async athleteIsRegistered(athleteId: number): Promise<Boolean> {
    const athlete = db.collection("athletes").doc(athleteId.toString());
    return await athlete.get().then((data) => {
      return data.exists;
    });
  }

  static async storeAthlete(data: TokenFromCodeResponse, group?: string) {
    const doc = db.collection("athletes").doc(data.athlete.id.toString());
    const athlete = {
      id: data.athlete.id,
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
      profile: data.athlete.profile,
      refreshToken: data.refresh_token,
      club: group || "Group 1",
    };
    await doc.create({ ...athlete });
  }

  static async updateAthletesRefreshToken(athletes: Athlete[]) {
    for (const athlete of athletes) {
      const doc = db.collection("athletes").doc(athlete.id.toString());
      doc.update({
        refreshToken: athlete.refreshToken,
      });
    }
  }
}

export interface SummerBodiesConfig {
  slackWebhookUrl: string;
  stravaBotId: string;
  stravaClientId: string;
  stravaRefreshToken: string;
  stravaClientSecret: string;
  stravaClubs: string[];
}
