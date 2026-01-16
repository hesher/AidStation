/**
 * AI Service Types
 *
 * Defines the interfaces for the AI abstraction layer,
 * allowing flexibility to swap LLM providers.
 */

export interface AidStationInfo {
  name: string;
  distanceKm: number;
  elevationM?: number;
  hasDropBag?: boolean;
  hasCrew?: boolean;
  hasPacer?: boolean;
  cutoffTime?: string;
  cutoffHoursFromStart?: number;
}

export interface RaceSearchResult {
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
  aidStations?: AidStationInfo[];
  courseGpxUrl?: string;
  courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number }>;
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
