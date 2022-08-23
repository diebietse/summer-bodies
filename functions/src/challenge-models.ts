export enum GroupingType {
  Distance = "Distance",
  Duration = "Duration",
  Elevation = "Elevation",
}

export enum ActivityType {
  OnFoot = "On Foot", // Hike, Run, Walk
  OnWheels = "On Wheels", // Ride
  Other = "Other",
}

export interface Club {
  name: string;
  events: StravaEvent[];
}

// Cycle, Run, Other
export interface StravaEvent {
  name: ActivityType;
  groupings: Grouping[];
}

// Distance, Duration, ...
export interface Grouping {
  name: string;
  contestants: Contestant[];
  unit: string;
}

export interface Contestant {
  name: string;
  total: number;
}

export interface WeeklyResult {
  name: string;
  achieved: boolean;
  activities: number;
  totalTimeMin: number;
  goal: number;
}

export interface OurEvent {
  scrapeTime: Date;
  id: string;
  athleteId: string;
  type: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  totalElevationGain: number;
  firstName: string;
  lastName: string;
  club: string;
  eventName: string;
}

export interface ContestantFitcoin {
  name: string;
  fitcoin: number;
}

export function compareContestantFitcoin(a: ContestantFitcoin, b: ContestantFitcoin) {
  if (a.fitcoin < b.fitcoin) return 1;
  if (a.fitcoin > b.fitcoin) return -1;
  return 0;
}

// subset of https://developers.strava.com/docs/reference/#api-models-SummaryActivity
export interface Activity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  type: StravaActivityType;
  start_date: string;
}

// subset of https://developers.strava.com/docs/reference/#api-models-DetailedAthlete
export interface Athlete {
  id: string;
  firstname: string;
  lastname: string;
  profile: string;
  refreshToken: string;
}

export interface AthleteWithActivities extends Athlete {
  activities: Activity[];
}

type StravaActivityType =
  | "AlpineSki"
  | "BackcountrySki"
  | "Canoeing"
  | "Crossfit"
  | "EBikeRide"
  | "Elliptical"
  | "Golf"
  | "Handcycle"
  | "Hike"
  | "IceSkate"
  | "InlineSkate"
  | "Kayaking"
  | "Kitesurf"
  | "NordicSki"
  | "Ride"
  | "RockClimbing"
  | "RollerSki"
  | "Rowing"
  | "Run"
  | "Sail"
  | "Skateboard"
  | "Snowboard"
  | "Snowshoe"
  | "Soccer"
  | "StairStepper"
  | "StandUpPaddling"
  | "Surfing"
  | "Swim"
  | "Velomobile"
  | "VirtualRide"
  | "VirtualRun"
  | "Walk"
  | "WeightTraining"
  | "Wheelchair"
  | "Windsurf"
  | "Workout"
  | "Yoga";
