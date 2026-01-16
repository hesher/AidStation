/**
 * API Client
 *
 * Client for interacting with the AidStation API.
 */

import { RaceData, RaceSearchResponse, RaceResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
 * Upload a GPX activity
 */
export async function uploadActivity(
  gpxContent: string,
  name?: string,
  activityDate?: string
): Promise<ActivityResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        gpxContent,
        name,
        activityDate,
      }),
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
