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