import axios, { AxiosRequestConfig } from "axios";
import { Athlete, Activity, AthleteWithActivities } from "./challenge-models";
import { getCurrentWeekUnix } from "./util";

const REFRESH_GRANT_TYPE = "refresh_token";

export class Strava {
  constructor(private clientId: string, private clientSecret: string) {}

  static async getToken(clientId: string, clientSecret: string, refreshToken: string): Promise<TokenRefreshResponse> {
    const client = axios.create(this.axiosConfig());

    const req: TokenRefreshRequest = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: REFRESH_GRANT_TYPE,
      refresh_token: refreshToken,
    };
    const result = await client.post<TokenRefreshResponse>("oauth/token", req);

    return result.data;
  }

  async getAthleteActivities(refreshToken: string): Promise<Activity[]> {
    const token = await Strava.getToken(this.clientId, this.clientSecret, refreshToken);
    const client = axios.create(Strava.axiosConfig(token.access_token));
    const start = getCurrentWeekUnix();
    const result = await client.get<Activity[]>(`/athlete/activities?after=${start}`);
    return result.data;
  }

  async populateAthleteActivities(athlete: Athlete): Promise<AthleteWithActivities> {
    const activities = await this.getAthleteActivities(athlete.refreshToken);
    return {
      ...athlete,
      activities
    };
  }

  async getAllAthletesActivities(athletes: Athlete[]): Promise<AthleteWithActivities[]> {
    let activityPromises: Promise<AthleteWithActivities>[] = [];
    for (const athlete of athletes) {
      activityPromises.push(this.populateAthleteActivities(athlete));
    }
    return Promise.all(activityPromises);
  }

  private static axiosConfig(authToken?: string): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      responseType: "json",
      headers: { "Content-Type": "application/json" },
      baseURL: "https://www.strava.com/api/v3",
    };
    if (authToken && config.headers) config.headers.Authorization = `Bearer ${authToken}`;

    return config;
  }
}

export interface TokenRefreshRequest {
  client_id: string;
  client_secret: string;
  grant_type: string;
  refresh_token: string;
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface CreateActivityRequest {
  name: string;
  type: string;
  start_date_local: string;
  elapsed_time: number;
  description?: string;
  distance?: number;
  trainer?: number;
  commute?: number;
}

// interface StravaEvent {
//   athlete: StravaAthlete;
//   name: string;
//   distance: number;
//   moving_time: number;
//   elapsed_time: number;
//   total_elevation_gain: number;
//   type: string;
// }

// // subset of https://developers.strava.com/docs/reference/#api-models-SummaryActivity
// interface StravaActivity {
//   id: number;
//   name: string;
//   distance: number;
//   moving_time: number;
//   total_elevation_gain: number;
//   type: ActivityType;
//   start_date: string;
// }
