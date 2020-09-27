import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { ContestantFitcoin, compareContestantFitcoin } from "./challenge-models";
import moment from "moment";

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
}

export interface SummerBodiesConfig {
  slackWebhookUrl: string;
  stravaBotId: string;
  stravaClientId: string;
  stravaRefreshToken: string;
  stravaAccessToken: string;
  stravaClientSecret: string;
  stravaClubs: string[];
}
