/**
 * Race Data Types
 *
 * Shared types for race data used across the frontend.
 */

export type WaypointType =
  | 'aid_station'
  | 'water_stop'
  | 'viewpoint'
  | 'toilet'
  | 'milestone'
  | 'custom';

export interface AidStation {
  name: string;
  distanceKm: number | null;
  distanceFromPrevKm?: number | null;
  elevationM?: number | null;
  elevationGainFromPrevM?: number;
  elevationLossFromPrevM?: number;
  hasDropBag?: boolean | null;
  hasCrew?: boolean | null;
  hasPacer?: boolean | null;
  cutoffTime?: string | null;
  cutoffHoursFromStart?: number | null;
  cutoffDayOffset?: number | null; // Day offset from race start (0 = race day, 1 = day 2, etc.)
  waypointType?: WaypointType;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CourseCoordinate {
  lat: number;
  lon: number;
  elevation?: number;
}

export interface RaceData {
  id?: string;
  name: string;
  date?: string;
  location?: string;
  country?: string;
  distanceKm?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  startElevationM?: number;
  startTime?: string;
  startCutoffHours?: number;
  overallCutoffHours?: number;
  description?: string;
  websiteUrl?: string;
  isPublic?: boolean;
  aidStations?: AidStation[];
  courseCoordinates?: CourseCoordinate[];
}

export interface RaceSearchResponse {
  success: boolean;
  data?: RaceData;
  error?: string;
}

export interface RaceResponse {
  success: boolean;
  data?: RaceData;
  error?: string;
}
