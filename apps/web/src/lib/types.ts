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
  waypointType?: WaypointType;
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
  startTime?: string;
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
