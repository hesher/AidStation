/**
 * AI Service Types
 *
 * Defines the interfaces for the AI abstraction layer,
 * allowing flexibility to swap LLM providers.
 */

export interface AidStationInfo {
  name: string;
  distanceKm: number | null;
  elevationM?: number | null;
  hasDropBag?: boolean | null;
  hasCrew?: boolean | null;
  hasPacer?: boolean | null;
  cutoffTime?: string | null;
  cutoffHoursFromStart?: number | null;
  waypointType?: string | null; // aid_station, water_stop, view_point, toilet, milestone, peak, checkpoint, custom
  latitude?: number | null;
  longitude?: number | null;
}

export interface RaceSearchResult {
  name: string;
  date?: string | null;
  location?: string | null;
  country?: string | null;
  distanceKm?: number | null;
  elevationGainM?: number | null;
  elevationLossM?: number | null;
  startTime?: string | null;
  overallCutoffHours?: number | null;
  description?: string | null;
  websiteUrl?: string | null;
  aidStations?: AidStationInfo[];
  courseGpxUrl?: string | null;
  courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number | null }>;
  metadata?: Record<string, unknown>;
}

export interface AISearchOptions {
  maxResults?: number;
  includeAidStations?: boolean;
  includeCourseData?: boolean;
}

/**
 * Waypoint to add based on AI interpretation
 */
export interface WaypointUpdate {
  action: 'add' | 'update' | 'remove';
  name: string;
  distanceKm?: number | null;
  elevationM?: number | null;
  waypointType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Result of AI race update interpretation
 */
export interface RaceUpdateResult {
  success: boolean;
  message: string;
  waypointUpdates: WaypointUpdate[];
  raceFieldUpdates?: {
    name?: string;
    date?: string;
    location?: string;
    country?: string;
    distanceKm?: number;
    elevationGainM?: number;
    elevationLossM?: number;
    startTime?: string;
    overallCutoffHours?: number;
  };
}

/**
 * Options for AI race update request
 */
export interface AIRaceUpdateOptions {
  raceDistanceKm?: number | null;
  existingWaypoints?: AidStationInfo[];
  courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number | null }>;
}

export interface AIProvider {
  name: string;

  /**
   * Search for race information using AI
   */
  searchRace(query: string, options?: AISearchOptions): Promise<RaceSearchResult>;

  /**
   * Interpret and process a natural language race update request
   */
  updateRace?(
    instruction: string,
    options: AIRaceUpdateOptions
  ): Promise<RaceUpdateResult>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}

export interface AIServiceConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
