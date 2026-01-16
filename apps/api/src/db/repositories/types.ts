/**
 * Repository Types
 *
 * Types used across database repositories.
 */

import { races, aidStations } from '../schema';

// Infer types from schema
export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
export type AidStation = typeof aidStations.$inferSelect;
export type NewAidStation = typeof aidStations.$inferInsert;

/**
 * Race data for creating/updating races
 */
export interface RaceData {
  name: string;
  date?: string | null;
  location?: string | null;
  country?: string | null;
  distanceKm?: number | null;
  elevationGainM?: number | null;
  elevationLossM?: number | null;
  startTime?: string | null;
  overallCutoffHours?: number | null;
  courseGpx?: string;
  isPublic?: boolean;
  ownerId?: string;
  metadata?: Record<string, unknown>;
  courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number }>;
}

/**
 * Aid station data for creating/updating aid stations
 */
export interface AidStationData {
  name: string;
  distanceKm?: number | null;
  distanceFromPrevKm?: number | null;
  elevationM?: number | null;
  elevationGainFromPrevM?: number | null;
  elevationLossFromPrevM?: number | null;
  hasDropBag?: boolean | null;
  hasCrew?: boolean | null;
  hasPacer?: boolean | null;
  cutoffTime?: string | null;
  cutoffHoursFromStart?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Race with its aid stations
 */
export interface RaceWithAidStations extends Race {
  aidStations: AidStation[];
}

/**
 * Session data for tracking last viewed race
 */
export interface SessionData {
  lastRaceId?: string;
  lastSearchQuery?: string;
  courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number }>;
}
