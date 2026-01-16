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

export interface AIProvider {
  name: string;

  /**
   * Search for race information using AI
   */
  searchRace(query: string, options?: AISearchOptions): Promise<RaceSearchResult>;

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
