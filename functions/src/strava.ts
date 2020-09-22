import axios, { AxiosRequestConfig } from "axios";
import { OurEvent } from "./challenge-models";
import { getCurrentWeek, getPreviousWeek } from "./util";

const REFRESH_GRANT_TYPE = "refresh_token";

export class Strava {
  constructor(private accessToken: string, private botId: string, private clubs: string[]) {}

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

  async createActivity(activity: CreateActivityRequest): Promise<string> {
    const client = axios.create(Strava.axiosConfig(this.accessToken));
    const result = await client.post<string>("activities", activity);
    return result.data;
  }

  async getThisWeeksActivities(clubId: string): Promise<OurEvent[]> {
    const stravaEvents = await Strava.getClubEvents(clubId, this.accessToken);
    const currentWeek = getCurrentWeek();
    let offset = 0;
    for (let stravaEvent of stravaEvents) {
      const athleteId = `${stravaEvent.athlete.firstname}-${stravaEvent.athlete.lastname}`;
      if (athleteId == this.botId) {
        break;
      }
      offset++;
    }
    const ourEvents = stravaEvents
      .slice(0, offset)
      .map((event: StravaEvent) => Strava.toOurEvent(event, clubId, currentWeek));
    return ourEvents;
  }

  async getThisWeeksActivitiesAllClubs(): Promise<OurEvent[]> {
    let allEvents: OurEvent[] = [];
    for (let club of this.clubs) {
      const clubEvents = await this.getThisWeeksActivities(club);
      allEvents = allEvents.concat(clubEvents);
    }
    return allEvents;
  }

  async getLastWeeksActivities(clubId: string): Promise<OurEvent[]> {
    const stravaEvents = await Strava.getClubEvents(clubId, this.accessToken);
    const currentWeek = getPreviousWeek();
    let start = 0;
    let end = 0;
    let isLastWeek = false;
    for (let stravaEvent of stravaEvents) {
      const athleteId = `${stravaEvent.athlete.firstname}-${stravaEvent.athlete.lastname}`;
      if (!isLastWeek) {
        start++;
        if (athleteId == this.botId) {
          isLastWeek = true;
        }
      } else if (isLastWeek && athleteId == this.botId) {
        break;
      }
      end++;
    }
    const ourEvents = stravaEvents
      .slice(start, end)
      .map((event: StravaEvent) => Strava.toOurEvent(event, clubId, currentWeek));
    return ourEvents;
  }

  async getLastWeeksActivitiesAllClubs(): Promise<OurEvent[]> {
    let allEvents: OurEvent[] = [];
    for (let club of this.clubs) {
      const clubEvents = await this.getLastWeeksActivities(club);
      allEvents = allEvents.concat(clubEvents);
    }
    return allEvents;
  }

  private static async getClubEvents(
    clubId: string,
    token: string,
    perPage: string = "200",
    page: string = "1"
  ): Promise<StravaEvent[]> {
    const client = axios.create(this.axiosConfig(token));
    const result = await client.get<Array<StravaEvent>>(`clubs/${clubId}/activities?page=${page}&per_page=${perPage}`);
    return result.data;
  }

  private static axiosConfig(authToken?: string): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      responseType: "json",
      headers: { "Content-Type": "application/json" },
      baseURL: "https://www.strava.com/api/v3",
    };
    if (authToken) config.headers.Authorization = `Bearer ${authToken}`;

    return config;
  }

  private static toOurEvent(event: StravaEvent, clubId: string, week: Date): OurEvent {
    return {
      scrapeTime: week,
      id: `${event.athlete.firstname}-${event.athlete.lastname}-${event.name}-${event.distance}-${event.moving_time}-${event.total_elevation_gain}-${event.type}`,
      athleteId: `${event.athlete.firstname}-${event.athlete.lastname}`,
      firstName: `${event.athlete.firstname}`,
      lastName: `${event.athlete.lastname}`,
      type: event.type,
      distance: event.distance,
      movingTime: event.moving_time,
      elapsedTime: event.elapsed_time,
      totalElevationGain: event.total_elevation_gain,
      club: clubId,
      eventName: event.name,
    };
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

interface StravaEvent {
  athlete: StavaAthlete;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
}

interface StavaAthlete {
  firstname: string;
  lastname: string;
}
