import { initializeApp, cert } from "firebase-admin/app";
import { CollectionReference, getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import { ContestantFitcoin, compareContestantFitcoin, Athlete, StreakState } from "./challenge-models";
import moment from "moment";
import { TokenFromCodeResponse } from "./strava";

// service-account.json in the root directory of the project
const CUSTOM_SERVICE_ACCOUNT = path.resolve(__dirname, "../../service-account.json");

if (fs.existsSync(CUSTOM_SERVICE_ACCOUNT)) {
  // If custom service account exists in expected place, use it. storageBucket has to be set explicitly here -
  // unlike the deployed-on-GCP case below, there's no ambient project config to infer it from. `<project-id>.appspot.com`
  // is right for projects created before Google's Oct 2024 default-bucket change; a project created after that
  // defaults to `<project-id>.firebasestorage.app` instead - set FIREBASE_STORAGE_BUCKET to override if so.
  console.log(`Using custom service account: ${CUSTOM_SERVICE_ACCOUNT}`);
  const { project_id } = JSON.parse(fs.readFileSync(CUSTOM_SERVICE_ACCOUNT, "utf8"));
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${project_id}.appspot.com`;
  initializeApp({ credential: cert(CUSTOM_SERVICE_ACCOUNT), storageBucket });
} else {
  // If no custom service account exists this is deployed on GCP and googles sets it for us
  initializeApp();
}

const db = getFirestore();
const configRef = db.collection("config").doc("config");
// Kept in its own collection (rather than alongside configRef) so it's trivially safe to expose publicly -
// nothing in here is ever a secret, unlike SummerBodiesConfig.
const brandingRef = db.collection("branding").doc("branding");

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

  static async getBranding(): Promise<Branding | null> {
    const doc = (await brandingRef.get()).data();
    return (doc as Branding) ?? null;
  }

  static async uploadBranding(branding: Branding): Promise<void> {
    await brandingRef.set(branding);
  }

  private static async writeFitcoinDocs(collection: CollectionReference, contestants: ContestantFitcoin[]): Promise<void> {
    const batch = db.batch();
    contestants.forEach((contestant) => batch.set(collection.doc(contestant.name), { fitcoin: contestant.fitcoin }));
    await batch.commit();
  }

  static async storeFitcoin(fitcoinsContestants: ContestantFitcoin[], date: Date): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(date.toDateString()).collection("athletes"), fitcoinsContestants);
  }

  // Uses a `streak-` prefixed doc id (rather than reusing storeFitcoin's date-keyed doc) so a daily streak
  // award never collides with a weekly award that happens to land on the same calendar day.
  static async storeStreakFitcoin(fitcoinsContestants: ContestantFitcoin[], dateString: string): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(`streak-${dateString}`).collection("athletes"), fitcoinsContestants);
  }

  // Scoped under the challenge's start date (like fitcoin/<date>/athletes/<name> above) so a new challenge run
  // - a new year's challengeStartDate - starts every athlete fresh, instead of inheriting a prior run's
  // `alive: false` and staying permanently eliminated.
  static async getStreaks(challengeStartDate: string): Promise<Map<string, StreakState>> {
    const docs = await db.collection("streaks").doc(challengeStartDate).collection("athletes").get();
    const streaks = new Map<string, StreakState>();
    docs.forEach((doc) => streaks.set(doc.id, doc.data() as StreakState));
    return streaks;
  }

  static async saveStreaks(challengeStartDate: string, streaks: StreakState[]): Promise<void> {
    const collection = db.collection("streaks").doc(challengeStartDate).collection("athletes");
    const batch = db.batch();
    streaks.forEach((streak) => batch.set(collection.doc(streak.athleteId), streak));
    await batch.commit();
  }

  static async getFitcoinTotals(): Promise<ContestantFitcoin[]> {
    const collection = db.collection("fitcoin");
    const docs = await collection.listDocuments();
    let contestants = new Map<string, number>();
    for (const doc of docs) {
      const athletes = await doc.collection("athletes").get();
      athletes.forEach((doc) => {
        const data = doc.data();
        let total = contestants.get(doc.id) || 0;
        total += data.fitcoin;
        contestants.set(doc.id, total);
      });
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
    const athletes = await collection.get();
    let res: Athlete[] = [];
    athletes.forEach((doc) => {
      res.push(doc.data() as Athlete);
    });

    return res;
  }

  static async athleteIsRegistered(athleteId: number): Promise<Boolean> {
    const athlete = db.collection("athletes").doc(athleteId.toString());
    return await athlete.get().then((data) => {
      return data.exists;
    });
  }

  static async storeAthlete(data: TokenFromCodeResponse) {
    const doc = db.collection("athletes").doc(data.athlete.id.toString());
    const athlete = {
      id: data.athlete.id,
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
      profile: data.athlete.profile,
      refreshToken: data.refresh_token,
      club: "All",
    };
    await doc.create({ ...athlete });
  }

  static async updateAthletesRefreshToken(athletes: Athlete[]) {
    await Promise.all(athletes.map((athlete) => db.collection("athletes").doc(athlete.id.toString()).update({ refreshToken: athlete.refreshToken })));
  }

  // Deletes an athlete's registration (profile + refresh token) and, if given, their doc in the current
  // challenge's streak collection - see functions/examples/remove-athlete.ts. Used to honor a deauthorization
  // or data-deletion request (see the Strava API Agreement's termination clause on deleting Strava Data), and
  // doubles as the fix for a revoked/invalid refresh token, which otherwise fails every future Strava fetch for
  // that athlete and, since getAllAthletesActivities treats one athlete's failure as a whole-batch failure,
  // blocks daily/weekly results generation for everyone until the athlete is removed.
  static async removeAthlete(athleteId: string, challengeStartDate?: string): Promise<void> {
    const batch = db.batch();
    batch.delete(db.collection("athletes").doc(athleteId));
    if (challengeStartDate) {
      batch.delete(db.collection("streaks").doc(challengeStartDate).collection("athletes").doc(athleteId));
    }
    await batch.commit();
  }

  static async storeResults(id: string, results: string): Promise<void> {
    await db.collection("results").doc(id).set({ result: results });
  }

  static async getResults(id: string): Promise<string | null> {
    const doc = await db.collection("results").doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      return data?.result || null;
    }
    return null;
  }
}

export interface SummerBodiesConfig {
  slackWebhookUrl: string;
  slackChannelDaily: string;
  slackChannelWeekly: string;
  // Where unexpected backend errors get reported - see errorReporting.ts. Optional so existing deployments
  // without it don't break; error reporting is just skipped if unset.
  slackChannelErrors?: string;
  stravaBotId: string;
  stravaClientId: string;
  stravaRefreshToken: string;
  stravaClientSecret: string;
  // Inclusive UTC calendar dates ("YYYY-MM-DD") bounding the streak challenge.
  challengeStartDate: string;
  challengeEndDate: string;
}

// Public-safe (no secrets) white-labeling for the website - see api.ts's GET /branding and
// functions/examples/upload-branding.ts.
export interface Branding {
  appName: string;
  logoUrl: string;
  faviconUrl?: string;
}
