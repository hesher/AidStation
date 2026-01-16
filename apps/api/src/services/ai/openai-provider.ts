/**
 * OpenAI Provider
 *
 * Implementation of AI provider using OpenAI's GPT models.
 */

import OpenAI from 'openai';
import { AIProvider, AISearchOptions, RaceSearchResult, AidStationInfo } from './types';

const RACE_SEARCH_SYSTEM_PROMPT = `You are an expert on ultra-marathon and endurance running races worldwide.
When given a race name, you must provide detailed, accurate information about that race.

CRITICAL: ONLY PROVIDE INFORMATION YOU ARE CERTAIN ABOUT. DO NOT MAKE UP OR FABRICATE DATA.

You must respond with valid JSON only, no other text. Use this exact structure:
{
  "name": "Official race name",
  "date": "YYYY-MM-DD or null if unknown",
  "location": "City/Region name",
  "country": "Country name",
  "distanceKm": number (race distance in kilometers) or null,
  "elevationGainM": number (total elevation gain in meters) or null,
  "elevationLossM": number (total elevation loss in meters) or null,
  "startTime": "HH:MM" (24-hour format) or null if unknown,
  "overallCutoffHours": number (overall time limit in hours) or null,
  "description": "Brief description of the race",
  "websiteUrl": "Official race website URL" or null,
  "aidStations": [
    {
      "name": "Station name",
      "distanceKm": number (distance from start) or null if unknown,
      "elevationM": number (elevation in meters) or null if unknown,
      "hasDropBag": boolean or null if unknown,
      "hasCrew": boolean or null if unknown,
      "hasPacer": boolean or null if unknown,
      "cutoffTime": "HH:MM" or null,
      "cutoffHoursFromStart": number or null
    }
  ],
  "courseCoordinates": [
    {"lat": number, "lon": number, "elevation": number or null}
  ]
}

STRICT GUIDELINES - YOU MUST FOLLOW THESE:
1. NEVER FABRICATE DATA: If you don't know specific information, use null. Do not guess or make up values.
2. NEVER ASSUME EQUAL DISTANCES: Do not calculate aid station distances by dividing total distance evenly. If you don't know the actual distance to an aid station, set distanceKm to null.
3. NEVER INVENT AID STATION NAMES: Only include aid stations you are certain exist. An empty array is acceptable.
4. NEVER FABRICATE ELEVATION DATA: If you don't know the actual elevation gain/loss or aid station elevations, use null.
5. NEVER GUESS COORDINATES: Only provide courseCoordinates if you know the actual GPS coordinates. An empty array is acceptable.
6. ACCURACY OVER COMPLETENESS: It is far better to return null values than to provide inaccurate data.

For aid stations:
- Only include stations you are confident exist in the race
- Only include distances you know from official race information
- If you only know the station name but not its distance, include it with distanceKm: null
- Do NOT estimate distances based on total race distance
- Do NOT assume evenly spaced checkpoints

For elevation data:
- Only provide elevationGainM/elevationLossM if you know the actual figures
- Do NOT estimate based on location or race type

The user will use this data for race planning - inaccurate data could be dangerous. When in doubt, use null.
`;

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI | null = null;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4-turbo-preview') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      this.client = new OpenAI({ apiKey: key });
    }
    this.model = model;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async searchRace(query: string, options?: AISearchOptions): Promise<RaceSearchResult> {
    if (!this.client) {
      throw new Error('OpenAI client not configured. Please set OPENAI_API_KEY environment variable.');
    }

    const userPrompt = `Find detailed information about this race: "${query}"

${options?.includeAidStations !== false ? 'Include all aid stations with their distances, services (drop bags, crew, pacers), and cutoff times if known.' : ''}
${options?.includeCourseData !== false ? 'Include approximate course coordinates for major waypoints.' : ''}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: RACE_SEARCH_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content) as RaceSearchResult;

      // Validate and clean the response
      return this.validateAndCleanResult(parsed, query);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Failed to parse AI response as JSON');
      }
      throw error;
    }
  }

  private validateAndCleanResult(result: RaceSearchResult, originalQuery: string): RaceSearchResult {
    // Ensure name exists
    if (!result.name) {
      result.name = originalQuery;
    }

    // Clean up aid stations - only require a valid name, allow null for distanceKm
    if (result.aidStations) {
      result.aidStations = result.aidStations
        .filter((s): s is AidStationInfo => s && typeof s.name === 'string' && s.name.length > 0)
        .map(s => ({
          ...s,
          // Ensure distanceKm is either a valid number or null
          distanceKm: typeof s.distanceKm === 'number' && !isNaN(s.distanceKm) ? s.distanceKm : null,
          elevationM: typeof s.elevationM === 'number' && !isNaN(s.elevationM) ? s.elevationM : null,
        }))
        // Sort by distance, putting stations with null distances at the end
        .sort((a, b) => {
          if (a.distanceKm === null && b.distanceKm === null) return 0;
          if (a.distanceKm === null) return 1;
          if (b.distanceKm === null) return -1;
          return a.distanceKm - b.distanceKm;
        });
    }

    // Clean up coordinates
    if (result.courseCoordinates) {
      result.courseCoordinates = result.courseCoordinates.filter(
        c => typeof c.lat === 'number' && typeof c.lon === 'number'
      );
    }

    // Ensure numeric values are actually numbers or null
    if (result.distanceKm !== null && result.distanceKm !== undefined) {
      result.distanceKm = Number(result.distanceKm);
      if (isNaN(result.distanceKm)) result.distanceKm = null;
    }
    if (result.elevationGainM !== null && result.elevationGainM !== undefined) {
      result.elevationGainM = Number(result.elevationGainM);
      if (isNaN(result.elevationGainM)) result.elevationGainM = null;
    }
    if (result.elevationLossM !== null && result.elevationLossM !== undefined) {
      result.elevationLossM = Number(result.elevationLossM);
      if (isNaN(result.elevationLossM)) result.elevationLossM = null;
    }
    if (result.overallCutoffHours !== null && result.overallCutoffHours !== undefined) {
      result.overallCutoffHours = Number(result.overallCutoffHours);
      if (isNaN(result.overallCutoffHours)) result.overallCutoffHours = null;
    }

    return result;
  }
}
