import { RaceData, AidStation, WaypointType } from './types';

// Re-export types for convenience
export type { RaceData, AidStation, WaypointType };

// Types for race responses
interface RaceSearchResponse {
  success: boolean;
  data?: RaceData;
  error?: string;
}

interface RaceResponse {
  success: boolean;
  data?: RaceData;
  error?: string;
}

// Waypoint update from AI service
export interface WaypointUpdate {
  action: 'add' | 'update' | 'remove';
  name: string;
  distanceKm: number | null;
  waypointType?: WaypointType;
  elevationM?: number | null;
  latitude?: number;
  longitude?: number;
}

// Race field updates from AI service
export interface RaceFieldUpdates {
  name?: string;
  date?: string;
  location?: string;
  country?: string;
  distanceKm?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  startTime?: string;
  startCutoffHours?: number;
  overallCutoffHours?: number;
}

// Response for AI-powered race update
export interface UpdateRaceWithAIResponse {
  success: boolean;
  data?: {
    message: string;
    waypointUpdates: WaypointUpdate[];
    updatedAidStations?: AidStation[];
    raceFieldUpdates?: RaceFieldUpdates;
    updatedRace?: RaceData;
  };
  error?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Export plan as PDF/printable format
 */
export async function exportPlanAsPdf(id: string): Promise<{ success: boolean; error?: string }> {
  // For now, we'll just open the plan in a new window for printing
  // A more sophisticated implementation would generate an actual PDF
  window.open(`/planning?planId=${id}&print=true`, '_blank');
  return { success: true };
}

// Terrain Segments types for performance breakdown
export interface TerrainSegment {
  segmentIndex: number;
  terrainType: 'climb' | 'descent' | 'flat' | 'rolling_hills';
  gradeCategory: string;
  startDistanceKm: number;
  endDistanceKm: number;
  distanceKm: number;
  elevationStartM: number;
  elevationEndM: number;
  totalAscentM: number;
  totalDescentM: number;
  averageGradePercent: number;
  timeSeconds: number;
  paceMinKm: number;
  gradeAdjustedPaceMinKm: number;
}

export interface TerrainSegmentsSummary {
  climb: {
    totalDistanceKm: number;
    totalTimeSeconds: number;
    totalElevationM: number;
    averagePaceMinKm: number;
    segmentCount: number;
  };
  descent: {
    totalDistanceKm: number;
    totalTimeSeconds: number;
    totalElevationM: number;
    averagePaceMinKm: number;
    segmentCount: number;
  };
  flat: {
    totalDistanceKm: number;
    totalTimeSeconds: number;
    averagePaceMinKm: number;
    segmentCount: number;
  };
  totalSegments: number;
}

export interface TerrainSegmentsData {
  activityId: string;
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalElevationLossM: number;
  totalTimeSeconds: number;
  segments: TerrainSegment[];
  summary: TerrainSegmentsSummary;
}

interface TerrainSegmentsResponse {
  success: boolean;
  data?: TerrainSegmentsData;
  error?: string;
}

/**
 * Get terrain segments breakdown for an activity
 * Breaks down the activity into climb/descent/flat sections with 5km blocks for flat/descent
 */
export async function getActivityTerrainSegments(id: string): Promise<TerrainSegmentsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/${id}/terrain-segments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get terrain segments',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Search for a race using AI
 */
export async function searchRace(query: string): Promise<RaceSearchResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query,
        includeAidStations: true,
        includeCourseData: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to search for race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Save a race to the database
 */
export async function saveRace(race: RaceData): Promise<RaceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(race),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to save race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get the current/last viewed race
 */
export async function getCurrentRace(): Promise<RaceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/current`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      // 404 is expected when no previous race exists
      if (response.status === 404) {
        return {
          success: false,
          error: 'No previous race found',
        };
      }
      return {
        success: false,
        error: data.error || 'Failed to get current race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get a race by ID
 */
export async function getRace(id: string): Promise<RaceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Update a race in the database
 */
export async function updateRace(
  id: string,
  updates: Partial<RaceData>
): Promise<RaceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ healthy: boolean; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();

    return {
      healthy: response.ok && data.status === 'ok',
      message: data.message,
    };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : 'API unavailable',
    };
  }
}

// Activity types
interface ActivityData {
  id: string;
  name?: string;
  activityDate?: string;
  distanceKm?: number;
  elevationGainM?: number;
  movingTimeSeconds?: number;
  averagePaceMinKm?: number;
  gradeAdjustedPaceMinKm?: number;
  status: string;
  createdAt: string;
}

interface ActivitiesResponse {
  success: boolean;
  data?: {
    activities: ActivityData[];
    total: number;
  };
  error?: string;
}

interface ActivityResponse {
  success: boolean;
  data?: ActivityData;
  error?: string;
}

interface PerformanceProfileData {
  flatPaceMinKm?: number;
  climbingPaceMinKm?: number;
  descendingPaceMinKm?: number;
  fatigueFactor?: number;
  activitiesCount: number;
  lastUpdated?: string;
}

interface PerformanceProfileResponse {
  success: boolean;
  data?: PerformanceProfileData;
  error?: string;
}

/**
 * Get all activities for the current user
 */
export async function getActivities(limit = 50, offset = 0): Promise<ActivitiesResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/activities?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get activities',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Upload a GPX or FIT activity
 */
export async function uploadActivity(
  fileContent: string,
  name?: string,
  activityDate?: string,
  fileType: 'gpx' | 'fit' = 'gpx'
): Promise<ActivityResponse> {
  try {
    const body: {
      name?: string;
      activityDate?: string;
      gpxContent?: string;
      fitContent?: string;
      fileType?: 'gpx' | 'fit';
    } = {
      name,
      activityDate,
      fileType,
    };

    if (fileType === 'fit') {
      body.fitContent = fileContent;
    } else {
      body.gpxContent = fileContent;
    }

    const response = await fetch(`${API_BASE_URL}/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to upload activity',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get a single activity by ID
 */
export async function getActivity(id: string): Promise<ActivityResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get activity',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Delete an activity
 */
export async function deleteActivity(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to delete activity',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

// Activity coordinates type
export interface ActivityCoordinates {
  lat: number;
  lon: number;
  elevation?: number;
}

interface ActivityCoordinatesResponse {
  success: boolean;
  data?: {
    coordinates: ActivityCoordinates[];
    count: number;
  };
  error?: string;
}

/**
 * Get coordinates for an activity (parsed from GPX)
 */
export async function getActivityCoordinates(id: string): Promise<ActivityCoordinatesResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/${id}/coordinates`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get activity coordinates',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get the user's performance profile
 */
export async function getPerformanceProfile(): Promise<PerformanceProfileResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/performance/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get performance profile',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Sync all pending activities and update performance profile
 */
export async function syncActivities(): Promise<{
  success: boolean;
  data?: { synced: number; updated: number };
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/sync-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to sync activities',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Sync a single activity's analysis results
 */
export async function syncActivity(id: string): Promise<ActivityResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities/${id}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to sync activity',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

// Plan types
export interface AidStationPrediction {
  aidStationId: string;
  aidStationName: string;
  distanceKm: number;
  predictedArrivalMinutes: number;
  predictedArrivalTime: string;
  cutoffHoursFromStart?: number;
  cutoffTime?: string;
  bufferMinutes?: number;
  status: 'safe' | 'warning' | 'danger' | 'missed';
  pacePredictions: {
    segmentPaceMinKm: number;
    gradeAdjustedPaceMinKm: number;
    terrainFactor: number;
    fatigueFactor: number;
    nighttimeFactor: number;
  };
}

export interface RacePlan {
  id: string;
  userId: string;
  raceId: string;
  name: string | null;
  basePaceMinKm: number | null;
  nighttimeSlowdown: number | null;
  startTime: string | null;
  predictedFinishTime: string | null;
  predictedTotalMinutes: number | null;
  aidStationPredictions: AidStationPrediction[] | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
  race?: {
    id: string;
    name: string;
    distanceKm: number | null;
    elevationGainM: number | null;
    startTime: string | null;
  };
}

interface PlansResponse {
  success: boolean;
  data?: {
    plans: RacePlan[];
    total: number;
  };
  error?: string;
}

interface PlanResponse {
  success: boolean;
  data?: RacePlan;
  error?: string;
}

/**
 * Create a new race plan
 */
export async function createPlan(
  raceId: string,
  options?: {
    name?: string;
    basePaceMinKm?: number;
    nighttimeSlowdown?: number;
    startTime?: string;
  }
): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        raceId,
        ...options,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to create plan',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get all plans for the current user
 */
export async function getPlans(limit = 50, offset = 0): Promise<PlansResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/plans?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get plans',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get a single plan by ID
 */
export async function getPlan(id: string): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get plan',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get plans for a specific race
 */
export async function getPlansByRace(raceId: string): Promise<PlansResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/race/${raceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get plans',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Update a plan
 */
export async function updatePlan(
  id: string,
  updates: {
    name?: string;
    basePaceMinKm?: number;
    nighttimeSlowdown?: number;
    startTime?: string;
  }
): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update plan',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Delete a plan
 */
export async function deletePlan(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to delete plan',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Generate predictions for a plan
 */
export async function generatePredictions(id: string): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/${id}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to generate predictions',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Set a plan as active
 */
export async function activatePlan(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/plans/${id}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to activate plan',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

// GPX Analysis types
export interface GpxAnalysisResult {
  courseStats?: {
    total_distance_km: number;
    total_elevation_gain_m: number;
    total_elevation_loss_m: number;
    min_elevation_m: number;
    max_elevation_m: number;
    avg_grade_percent: number;
    steep_sections_count: number;
  };
  elevationProfile?: Array<{
    distance_km: number;
    elevation_m: number;
    grade_percent: number;
  }>;
  aidStations?: Array<{
    name: string;
    distance_km: number;
    elevation_m: number;
    distance_from_prev_km: number;
    elevation_gain_from_prev_m: number;
    elevation_loss_from_prev_m: number;
    latitude?: number;
    longitude?: number;
  }>;
  coordinates?: Array<{
    lat: number;
    lon: number;
    elevation?: number;
  }>;
}

interface GpxAnalysisResponse {
  success: boolean;
  data?: GpxAnalysisResult;
  error?: string;
}

/**
 * Analyze a GPX file to extract course metrics
 * This sends the GPX to the Python worker for processing.
 */
export async function analyzeGpx(
  gpxContent: string,
  aidStations?: Array<{ name: string; distanceKm?: number; lat?: number; lon?: number }>
): Promise<GpxAnalysisResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/analyze-gpx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        gpxContent,
        aidStations,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to analyze GPX',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Update a race using AI interpretation of natural language instructions
 * Examples:
 * - "Add a milestone every 5 km"
 * - "Add a milestone on every mountain peak"
 * - "Add a water stop at 15 km"
 */
export async function updateRaceWithAI(
  raceId: string,
  instruction: string
): Promise<UpdateRaceWithAIResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/${raceId}/update-with-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ instruction }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update race with AI',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Delete a race
 */
export async function deleteRace(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to delete race',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Get all saved races (for race selection in planning)
 */
export async function getSavedRaces(): Promise<{
  success: boolean;
  data?: {
    races: Array<{
      id: string;
      name: string;
      date?: string;
      distanceKm?: number;
      country?: string;
    }>;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/races`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get saved races',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}
