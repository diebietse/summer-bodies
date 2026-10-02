import axios, { AxiosRequestConfig } from "axios";
import { Athlete, Activity, AthleteWithActivities } from "./challenge-models";

export interface FailedAthlete {
  id: string;
  name: string;
}

const REFRESH_GRANT_TYPE = "refresh_token";
const AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";
const ACTIVITIES_PER_PAGE = 50;

export class Strava {
  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

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
    const result = await client.get<Activity[]>(`/athlete/activities?after=${startUnixTime}&before=${endUnixTime}&per_page=${ACTIVITIES_PER_PAGE}`);
    return result.data;
  }

  // Single-activity detail fetch - used by the webhook event handler, which only ever learns an activity id
  // (not the activity itself) from a create/update event. Needs only activity:read, same scope athletes
  // already grant today.
  async getActivity(accessToken: string, activityId: number): Promise<Activity> {
    const client = axios.create(Strava.axiosConfig(accessToken));
    const result = await client.get<Activity>(`/activities/${activityId}`);
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

  async populateAthleteActivities(athlete: Athlete, startUnixTime: number, endUnixTime: number): Promise<AthleteWithActivities> {
    const token = await Strava.getToken(this.clientId, this.clientSecret, athlete.refreshToken);
    athlete.refreshToken = token.refresh_token;
    const activities = await this.getAthleteActivities(token.access_token, startUnixTime, endUnixTime);
    return {
      ...athlete,
      activities,
    };
  }

  async getAllAthletesActivities(athletes: Athlete[], startUnixTime: number, endUnixTime: number): Promise<GetAllAthletesActivitiesResult> {
    const failedAthletes: FailedAthlete[] = [];
    const activityPromises = athletes.map((athlete) =>
      this.populateAthleteActivities(athlete, startUnixTime, endUnixTime).catch((error) => {
        console.log(`Warning: failed getting athlete '${athlete.firstname} ${athlete.lastname}'`);
        console.log(error);
        failedAthletes.push({ id: athlete.id, name: `${athlete.firstname} ${athlete.lastname}` });
        return null;
      }),
    );

    const results = await Promise.all(activityPromises);

    // All-or-nothing: a single failed athlete discards the whole batch result, same as before - but now the
    // caller learns *who* failed instead of just `error: true`, so the resulting Slack alert can name them
    // directly instead of requiring a separate check-athlete-tokens.ts run to find out.
    if (failedAthletes.length > 0) {
      return { athletesWithActivities: [], error: true, failedAthletes };
    }

    return { athletesWithActivities: results as AthleteWithActivities[], error: false };
  }

  // Revokes an athlete's authorization grant on Strava's side - distinct from, and in addition to, deleting
  // our own stored copy of their data (Firestore.removeAthlete). Without this, an athlete we've locally
  // forgotten about still counts as "connected" from Strava's perspective, since nothing ever told Strava the
  // grant should end. Takes either an access or refresh token. This is the endpoint Strava documents as the
  // sole supported one from June 2027 onward (the legacy /oauth/deauthorize retires then), so it's used here
  // unconditionally rather than switched to later.
  static async revokeToken(clientId: string, clientSecret: string, token: string): Promise<void> {
    const client = axios.create(this.axiosConfig());
    await client.post(`oauth/revoke`, new URLSearchParams({ token }), {
      auth: { username: clientId, password: clientSecret },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  // Strava allows exactly one push subscription per application, covering every authorized athlete - see
  // functions/examples/manage-strava-webhook.ts, the only caller of these.
  static async createPushSubscription(clientId: string, clientSecret: string, callbackUrl: string, verifyToken: string): Promise<{ id: number }> {
    const client = axios.create(this.axiosConfig());
    const result = await client.post<{ id: number }>("push_subscriptions", {
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    });
    return result.data;
  }

  static async viewPushSubscriptions(clientId: string, clientSecret: string): Promise<{ id: number; callback_url: string }[]> {
    const client = axios.create(this.axiosConfig());
    const result = await client.get<{ id: number; callback_url: string }[]>(`push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`);
    return result.data;
  }

  static async deletePushSubscription(clientId: string, clientSecret: string, subscriptionId: number): Promise<void> {
    const client = axios.create(this.axiosConfig());
    await client.delete(`push_subscriptions/${subscriptionId}?client_id=${clientId}&client_secret=${clientSecret}`);
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

export interface GetAllAthletesActivitiesResult {
  athletesWithActivities: AthleteWithActivities[];
  error: boolean;
  failedAthletes?: FailedAthlete[];
}

// https://developers.strava.com/docs/webhooks/ - the POST body Strava sends for every subscribed event.
// Not signed/authenticated beyond the one-time subscription handshake, so a handler must independently
// verify owner_id/object_id correspond to something real before acting on them.
export interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  updates?: Record<string, string>;
  subscription_id: number;
  event_time: number;
}
