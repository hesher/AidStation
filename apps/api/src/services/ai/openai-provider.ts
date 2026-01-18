/**
 * OpenAI Provider
 *
 * Implementation of AI provider using OpenAI's GPT models.
 */

import OpenAI from 'openai';
import { AIProvider, AISearchOptions, RaceSearchResult, AidStationInfo, AIRaceUpdateOptions, RaceUpdateResult, WaypointUpdate } from './types';

const RACE_SEARCH_SYSTEM_PROMPT = `You are an expert on ultra-marathon and endurance running races worldwide with extensive knowledge of race courses, aid stations, and cutoff times.
When given a race name, you must search your knowledge for detailed, accurate information about that race.

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
      "name": "Station name (e.g., location name or checkpoint name)",
      "distanceKm": number (distance from start) or null if unknown,
      "elevationM": number (elevation in meters) or null if unknown,
      "hasDropBag": boolean or null if unknown,
      "hasCrew": boolean or null if unknown,
      "hasPacer": boolean or null if unknown,
      "cutoffTime": "HH:MM" (time of day when cutoff occurs, 24-hour format) or null,
      "cutoffHoursFromStart": number (hours from race start when cutoff occurs) or null,
      "servicesDescription": "Brief description of services available (food, drinks, medical, etc.)" or null
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

AID STATION PRIORITIES - VERY IMPORTANT:
Aid stations are critical for race planning. When you have knowledge about a race, prioritize finding:
1. Official checkpoint/aid station names and locations
2. Distances from the race start (in km)
3. Cutoff times - both as hours from start (cutoffHoursFromStart) AND time of day if start time is known
4. Services at each station (drop bags, crew access, pacer pickup points)
5. Elevation of each station if known

Well-known races (e.g., UTMB, Western States, Comrades, Leadville) have published aid station information - use your knowledge of these races.

CUTOFF TIME GUIDANCE:
- cutoffTime should be in 24-hour format (e.g., "14:30" for 2:30 PM)
- cutoffHoursFromStart is the elapsed time from race start (e.g., 12.5 for 12 hours 30 minutes)
- If only one is known, provide that one and leave the other null
- Many races publish progressive cutoff times - include them if known

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

const RACE_UPDATE_SYSTEM_PROMPT = `You are an AI assistant that helps endurance athletes update and modify their race details.
Your job is to interpret natural language instructions and generate structured updates to a race's waypoints and details.

You must respond with valid JSON only, no other text. Use this exact structure:
{
  "success": true,
  "message": "Brief description of what was done",
  "waypointUpdates": [
    {
      "action": "add" | "update" | "remove",
      "name": "Waypoint name",
      "distanceKm": number or null,
      "elevationM": number or null,
      "waypointType": "aid_station" | "water_stop" | "view_point" | "toilet" | "milestone" | "peak" | "checkpoint" | "custom",
      "latitude": number or null,
      "longitude": number or null,
      "cutoffTime": "HH:MM" (24-hour format, time of day) or null,
      "cutoffHoursFromStart": number (hours from race start, e.g., 7 for 7 hours, 12.5 for 12h30m) or null,
      "hasDropBag": boolean or null,
      "hasCrew": boolean or null,
      "hasPacer": boolean or null
    }
  ],
  "raceFieldUpdates": {
    "name": "string or omit if not changing",
    "date": "YYYY-MM-DD or omit if not changing",
    "distanceKm": number or omit if not changing,
    ...etc
  }
}

WAYPOINT TYPES:
- "aid_station": Full aid station with supplies and support
- "water_stop": Water-only station
- "view_point": Scenic viewpoint or landmark
- "toilet": Restroom or portable toilet
- "milestone": Distance or progress marker (e.g., "5km", "10km")
- "peak": Mountain peak or summit
- "checkpoint": Timing checkpoint or control point
- "custom": User-defined waypoint

CUTOFF TIME HANDLING - VERY IMPORTANT:
When the user specifies a cutoff time, you MUST include it in the response:
- "cutoff of 7 hours" → cutoffHoursFromStart: 7
- "cutoff at 12:30" → cutoffTime: "12:30"
- "7 hour cutoff" → cutoffHoursFromStart: 7
- "cutoff 10h30m" → cutoffHoursFromStart: 10.5
- Always extract and include any cutoff time mentioned by the user

COMMON INSTRUCTIONS AND HOW TO HANDLE THEM:
1. "Add a milestone every X km" - Create milestone waypoints at regular intervals (e.g., 5km, 10km, 15km...)
2. "Add a milestone on every mountain peak" - If course coordinates with elevation are provided, identify peaks (local maxima in elevation) and add peak waypoints
3. "Add a water stop at X km" - Add a water_stop waypoint at the specified distance
4. "Convert X to a view point" - Update the waypointType of an existing waypoint
5. "Remove the checkpoint at X km" - Set action to "remove" for that waypoint
6. "Add an aid station at mile X with cutoff of Y hours" - Convert miles to km (1 mile = 1.60934 km), add aid_station with cutoffHoursFromStart set to Y

DISTANCE CONVERSION:
- If the user specifies distance in miles, convert to kilometers: miles × 1.60934 = km
- Example: "mile 50" = 50 × 1.60934 = 80.467 km

IMPORTANT:
- When adding milestones at intervals, use the race distance to determine how many to add
- When adding milestones for peaks, look at the elevation data from course coordinates
- Always provide meaningful names (e.g., "5km Marker", "Summit 1", "Ridge View", "Aid Station at Mile 50")
- If you can't fulfill the request (missing data, unclear instruction), set success to false and explain in the message
- For elevation-based waypoints, try to find the elevation from the course coordinates if provided
- ALWAYS include cutoff information when the user mentions cutoffs

COURSE DATA:
- If course coordinates are provided, use them to:
  1. Calculate elevations at specific distances
  2. Identify peaks (local maxima in elevation data)
  3. Identify view points (points with significant elevation or landmarks)
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

  /**
   * Interpret and process a natural language race update request
   */
  async updateRace(
    instruction: string,
    options: AIRaceUpdateOptions
  ): Promise<RaceUpdateResult> {
    if (!this.client) {
      throw new Error('OpenAI client not configured. Please set OPENAI_API_KEY environment variable.');
    }

    // Build context for the AI
    const contextParts: string[] = [];

    if (options.raceDistanceKm) {
      contextParts.push(`Race distance: ${options.raceDistanceKm} km`);
    }

    if (options.existingWaypoints && options.existingWaypoints.length > 0) {
      contextParts.push('Existing waypoints:');
      options.existingWaypoints.forEach((wp, i) => {
        const parts = [
          `  ${i + 1}. "${wp.name}"`,
          wp.distanceKm !== null ? `at ${wp.distanceKm}km` : '',
          wp.waypointType ? `(${wp.waypointType})` : '',
          wp.elevationM !== null ? `elevation: ${wp.elevationM}m` : '',
        ].filter(Boolean);
        contextParts.push(parts.join(' '));
      });
    }

    if (options.courseCoordinates && options.courseCoordinates.length > 0) {
      contextParts.push(`Course has ${options.courseCoordinates.length} coordinate points with elevation data.`);

      // Sample some elevation points to help identify peaks
      const elevationSamples: string[] = [];
      const step = Math.max(1, Math.floor(options.courseCoordinates.length / 20));
      for (let i = 0; i < options.courseCoordinates.length; i += step) {
        const coord = options.courseCoordinates[i];
        if (coord.elevation !== undefined && coord.elevation !== null) {
          const distanceEstimate = options.raceDistanceKm
            ? ((i / options.courseCoordinates.length) * options.raceDistanceKm).toFixed(1)
            : 'unknown';
          elevationSamples.push(`  ~${distanceEstimate}km: ${coord.elevation}m`);
        }
      }
      if (elevationSamples.length > 0) {
        contextParts.push('Elevation profile samples:');
        contextParts.push(...elevationSamples);
      }
    }

    const userPrompt = `${contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : ''}User instruction: "${instruction}"

Please interpret this instruction and generate the appropriate waypoint updates.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: RACE_UPDATE_SYSTEM_PROMPT },
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

      const parsed = JSON.parse(content) as RaceUpdateResult;

      // Validate and clean the response
      return this.validateAndCleanUpdateResult(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          success: false,
          message: 'Failed to parse AI response',
          waypointUpdates: [],
        };
      }
      throw error;
    }
  }

  private validateAndCleanUpdateResult(result: RaceUpdateResult): RaceUpdateResult {
    // Ensure success is a boolean
    result.success = !!result.success;

    // Ensure message is a string
    if (!result.message) {
      result.message = result.success ? 'Updates generated successfully' : 'Failed to process instruction';
    }

    // Validate waypoint updates
    if (!Array.isArray(result.waypointUpdates)) {
      result.waypointUpdates = [];
    }

    result.waypointUpdates = result.waypointUpdates
      .filter((wp): wp is WaypointUpdate => {
        return wp && typeof wp.name === 'string' && wp.name.length > 0 &&
          ['add', 'update', 'remove'].includes(wp.action);
      })
      .map(wp => ({
        action: wp.action,
        name: wp.name,
        distanceKm: typeof wp.distanceKm === 'number' && !isNaN(wp.distanceKm) ? wp.distanceKm : null,
        elevationM: typeof wp.elevationM === 'number' && !isNaN(wp.elevationM) ? wp.elevationM : null,
        waypointType: wp.waypointType || 'milestone',
        latitude: typeof wp.latitude === 'number' && !isNaN(wp.latitude) ? wp.latitude : null,
        longitude: typeof wp.longitude === 'number' && !isNaN(wp.longitude) ? wp.longitude : null,
        // Include cutoff fields
        cutoffTime: typeof wp.cutoffTime === 'string' && wp.cutoffTime.length > 0 ? wp.cutoffTime : null,
        cutoffHoursFromStart: typeof wp.cutoffHoursFromStart === 'number' && !isNaN(wp.cutoffHoursFromStart) ? wp.cutoffHoursFromStart : null,
        // Include service fields
        hasDropBag: typeof wp.hasDropBag === 'boolean' ? wp.hasDropBag : null,
        hasCrew: typeof wp.hasCrew === 'boolean' ? wp.hasCrew : null,
        hasPacer: typeof wp.hasPacer === 'boolean' ? wp.hasPacer : null,
      }))
      // Sort by distance
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });

    return result;
  }
}
