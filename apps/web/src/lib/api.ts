/**
 * API Client
 *
 * Client for interacting with the AidStation API.
 */

import { RaceData, RaceSearchResponse } from './types';

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
 * Get a race by ID
 */
export async function getRace(id: string): Promise<RaceSearchResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/races/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
