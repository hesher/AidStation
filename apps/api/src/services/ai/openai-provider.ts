/**
 * OpenAI Provider
 *
 * Implementation of AI provider using OpenAI's GPT models.
 */

import OpenAI from 'openai';
import { AIProvider, AISearchOptions, RaceSearchResult, AidStationInfo } from './types';

const RACE_SEARCH_SYSTEM_PROMPT = `You are an expert on ultra-marathon and endurance running races worldwide.
When given a race name, you must provide detailed, accurate information about that race.

You must respond with valid JSON only, no other text. Use this exact structure:
{
  "name": "Official race name",
  "date": "YYYY-MM-DD or 'Unknown' if uncertain",
  "location": "City/Region name",
  "country": "Country name",
  "distanceKm": number (race distance in kilometers),
  "elevationGainM": number (total elevation gain in meters),
  "elevationLossM": number (total elevation loss in meters),
  "startTime": "HH:MM" (24-hour format, typical start time),
  "overallCutoffHours": number (overall time limit in hours),
  "description": "Brief description of the race",
  "websiteUrl": "Official race website URL",
  "aidStations": [
    {
      "name": "Station name",
      "distanceKm": number (distance from start),
      "elevationM": number (elevation in meters),
      "hasDropBag": boolean,
      "hasCrew": boolean,
      "hasPacer": boolean,
      "cutoffTime": "HH:MM" or null,
      "cutoffHoursFromStart": number or null
    }
  ],
  "courseCoordinates": [
    {"lat": number, "lon": number, "elevation": number}
  ]
}

Guidelines:
- If you know the race well, provide complete information
- For aid stations, include as many as you know with accurate distances
- If you don't know specific information, use null for that field
- For courseCoordinates, provide key waypoints along the course (start, aid stations, finish) if you know them
- Be accurate - it's better to say null than to guess incorrectly
- Include the start and finish as part of the course flow
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

    // Clean up aid stations
    if (result.aidStations) {
      result.aidStations = result.aidStations
        .filter((s): s is AidStationInfo => s && typeof s.name === 'string' && typeof s.distanceKm === 'number')
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    // Clean up coordinates
    if (result.courseCoordinates) {
      result.courseCoordinates = result.courseCoordinates.filter(
        c => typeof c.lat === 'number' && typeof c.lon === 'number'
      );
    }

    // Ensure numeric values are actually numbers
    if (result.distanceKm) result.distanceKm = Number(result.distanceKm);
    if (result.elevationGainM) result.elevationGainM = Number(result.elevationGainM);
    if (result.elevationLossM) result.elevationLossM = Number(result.elevationLossM);
    if (result.overallCutoffHours) result.overallCutoffHours = Number(result.overallCutoffHours);

    return result;
  }
}
