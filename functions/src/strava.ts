import axios, { AxiosRequestConfig, isAxiosError } from "axios";
import { Athlete, Activity, AthleteWithActivities } from "./challenge-models";

const REFRESH_GRANT_TYPE = "refresh_token";
const AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";
const ACTIVITIES_PER_PAGE = 50;
export const STRAVA_REVOKE_URL = "https://www.strava.com/oauth/revoke";

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

  // `rereadRefreshToken` (optional) returns the athlete's currently stored refresh token. Strava invalidates a
  // refresh token as soon as it's used, and processing a webhook event (webhookEvents.ts) can rotate an athlete's
  // token at any moment - including between this batch reading every athlete's token and using it. So when a refresh is
  // rejected (400/401), re-read the stored token and, if it has since changed, retry once with it rather than
  // failing the athlete (and with them, the all-or-nothing weekly results).
  async populateAthleteActivities(
    athlete: Athlete,
    startUnixTime: number,
    endUnixTime: number,
    rereadRefreshToken?: (athleteId: string) => Promise<string | undefined>,
  ): Promise<AthleteWithActivities> {
    let token: TokenRefreshResponse;
    try {
      token = await Strava.getToken(this.clientId, this.clientSecret, athlete.refreshToken);
    } catch (error) {
      const rejected = isAxiosError(error) && (error.response?.status === 400 || error.response?.status === 401);
      const storedRefreshToken = rejected && rereadRefreshToken ? await rereadRefreshToken(athlete.id) : undefined;
      if (!storedRefreshToken || storedRefreshToken === athlete.refreshToken) throw error;
      console.log(`Refresh token for '${athlete.firstname} ${athlete.lastname}' was rotated by another writer - retrying with the stored one`);
      token = await Strava.getToken(this.clientId, this.clientSecret, storedRefreshToken);
    }
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
    endUnixTime: number,
    rereadRefreshToken?: (athleteId: string) => Promise<string | undefined>,
  ): Promise<GetAllAthletesActivitiesResult> {
    const failedAthletes: string[] = [];
    const results = await Promise.all(
      athletes.map((athlete) =>
        this.populateAthleteActivities(athlete, startUnixTime, endUnixTime, rereadRefreshToken).catch((error) => {
          console.log(`Warning: failed getting athlete '${athlete.firstname} ${athlete.lastname}'`);
          console.log(error);
          failedAthletes.push(`${athlete.firstname} ${athlete.lastname}`);
          return null;
        }),
      ),
    );

    const athletesWithActivities = results.filter((result): result is AthleteWithActivities => result !== null);
    return { athletesWithActivities, error: failedAthletes.length > 0, failedAthletes };
  }

  // Revokes an athlete's authorization grant on Strava's side - distinct from, and in addition to, deleting
  // our own stored copy of their data (Firestore.removeAthlete). Without this, an athlete we've locally
  // forgotten about still counts as "connected" from Strava's perspective, since nothing ever told Strava the
  // grant should end, and Strava ends all of the app's tokens for the athlete. Strava's /oauth/revoke (available since
  // June 2026, the only deauthorization endpoint from June 2027 - see https://developers.strava.com/docs/authentication/)
  // lives outside the /api/v3 base URL the other calls use - unlike /oauth/token, it isn't served under /api/v3. It
  // answers 200 whether or not the token was found, so any failure is a real one, worth trying again.
  static async revokeToken(clientId: string, clientSecret: string, refreshToken: string): Promise<void> {
    await axios.post(STRAVA_REVOKE_URL, new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }), {
      auth: { username: clientId, password: clientSecret },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  // Strava allows exactly one push subscription per application, covering every authorized athlete - see
  // functions/examples/manage-strava-webhook.ts, which manages it, and activityStore.checkWebhookLiveness, which
  // views it.
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

// `athletesWithActivities` only holds the athletes that were fetched successfully; `error` is true if any
// athlete failed (named in `failedAthletes`). Callers choose whether to carry on with a partial result.
export interface GetAllAthletesActivitiesResult {
  athletesWithActivities: AthleteWithActivities[];
  error: boolean;
  failedAthletes: string[];
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
