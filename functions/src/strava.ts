import axios, { AxiosRequestConfig } from "axios";
import { Athlete, Activity, AthleteWithActivities } from "./challenge-models";

const REFRESH_GRANT_TYPE = "refresh_token";
const AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";
const ACTIVITIES_PER_PAGE = 50;

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

  async getAthleteActivities(accessToken: string, startUnixTime: number, endUnixTime: number): Promise<Activity[]> {
    const client = axios.create(Strava.axiosConfig(accessToken));
    const result = await client.get<Activity[]>(
      `/athlete/activities?after=${startUnixTime}&before=${endUnixTime}&per_page=${ACTIVITIES_PER_PAGE}`
    );
    return result.data;
  }

  static async getTokenFromCode(clientId: string, clientSecret: string, code: string): Promise<TokenFromCodeResponse> {
    const client = axios.create(this.axiosConfig());

    const req: TokenFromCodeRequest = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
      code,
    };
    const result = await client.post<TokenFromCodeResponse>("oauth/token", req);
    return result.data;
  }

  async populateAthleteActivities(
    athlete: Athlete,
    startUnixTime: number,
    endUnixTime: number
  ): Promise<AthleteWithActivities> {
    const token = await Strava.getToken(this.clientId, this.clientSecret, athlete.refreshToken);
    athlete.refreshToken = token.refresh_token;
    const activities = await this.getAthleteActivities(token.access_token, startUnixTime, endUnixTime);
    return {
      ...athlete,
      activities,
    };
  }

  async getAllAthletesActivities(
    athletes: Athlete[],
    startUnixTime: number,
    endUnixTime: number
  ): Promise<AthleteWithActivities[]> {
    let activityPromises: Promise<AthleteWithActivities>[] = [];
    for (const athlete of athletes) {
      activityPromises.push(this.populateAthleteActivities(athlete, startUnixTime, endUnixTime));
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

export interface TokenFromCodeRequest {
  client_id: string;
  client_secret: string;
  grant_type: string;
  code: string;
}

export interface TokenFromCodeResponse {
  refresh_token: string;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
  };
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
