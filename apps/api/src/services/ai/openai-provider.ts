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

**MOST IMPORTANT INFORMATION FOR RACE PLANNING:**
1. RACE START TIME - Essential for calculating all cutoff times. Many ultra races start before dawn (e.g., 04:00, 05:00, 06:00).
2. OVERALL CUTOFF TIME - The total time limit for completing the race in hours.
3. CHECKPOINT/AID STATION CUTOFFS - Progressive cutoff times at each station are critical for pacing.

You must respond with valid JSON only, no other text. Use this exact structure:
{
  "name": "Official race name",
  "date": "YYYY-MM-DD or null if unknown",
  "location": "City/Region name",
  "country": "Country name",
  "distanceKm": number (race distance in kilometers) or null,
  "elevationGainM": number (total elevation gain in meters) or null,
  "elevationLossM": number (total elevation loss in meters) or null,
  "startTime": "HH:MM" (24-hour format) or null if unknown - THIS IS VERY IMPORTANT,
  "overallCutoffHours": number (overall time limit in hours) or null - THIS IS VERY IMPORTANT,
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
      "cutoffTime": "HH:MM" (time of day when cutoff occurs, 24-hour format) or null - PRIORITIZE THIS,
      "cutoffHoursFromStart": number (hours from race start when cutoff occurs) or null - PRIORITIZE THIS,
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
1. CUTOFF TIMES - This is the MOST important information for race planning!
   - cutoffHoursFromStart: hours elapsed from race start (e.g., 7, 12.5, 24)
   - cutoffTime: time of day in 24-hour format (e.g., "12:00", "18:30")
2. Official checkpoint/aid station names and locations
3. Distances from the race start (in km)
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
You will be provided with the CURRENT RACE DATA so you can understand the existing state and make informed updates.

You must respond with valid JSON only, no other text. Use this EXACT structure:

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
    "name": string,
    "date": "YYYY-MM-DD",
    "location": string,
    "country": string,
    "distanceKm": number,
    "elevationGainM": number,
    "elevationLossM": number,
    "startTime": "HH:MM" (24-hour format),
    "startCutoffHours": number (time allowed before start cutoff),
    "overallCutoffHours": number (total race time limit in hours),
    "description": string,
    "websiteUrl": string
  }
}

IMPORTANT: Only include fields in raceFieldUpdates that are being CHANGED. Omit fields that should remain unchanged.

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

RACE FIELD UPDATES - WHAT YOU CAN MODIFY:
You can update ANY of these race-level fields by including them in raceFieldUpdates:
- name: Race name
- date: Race date in YYYY-MM-DD format
- location: City or region name
- country: Country name
- distanceKm: Total race distance in kilometers
- elevationGainM: Total elevation gain in meters
- elevationLossM: Total elevation loss in meters
- startTime: Race start time in HH:MM 24-hour format (e.g., "05:00")
- startCutoffHours: Time allowed before start cutoff (hours)
- overallCutoffHours: Total race time limit in hours (e.g., 30 for a 30-hour limit)
- description: Race description
- websiteUrl: Official race website URL

EXAMPLES OF RACE FIELD UPDATES:
- "Change the start time to 6am" → raceFieldUpdates: { "startTime": "06:00" }
- "Set the overall cutoff to 36 hours" → raceFieldUpdates: { "overallCutoffHours": 36 }
- "Update the race name to Western States 100" → raceFieldUpdates: { "name": "Western States 100" }
- "The race is 168km with 10,000m elevation gain" → raceFieldUpdates: { "distanceKm": 168, "elevationGainM": 10000 }
- "Set the date to June 28, 2025" → raceFieldUpdates: { "date": "2025-06-28" }
`;

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI | null = null;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4o') {
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

    // Log the prompt being sent to the AI
    console.log('=== AI RACE SEARCH REQUEST ===');
    console.log('Query:', query);
    console.log('System Prompt:', RACE_SEARCH_SYSTEM_PROMPT);
    console.log('User Prompt:', userPrompt);
    console.log('==============================');

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

      // Log the raw AI response
      console.log('=== AI RACE SEARCH RESPONSE (RAW) ===');
      console.log(content);
      console.log('=====================================');

      const parsed = JSON.parse(content) as RaceSearchResult;

      // Validate and clean the response
      const result = this.validateAndCleanResult(parsed, query);

      // Log the cleaned/validated result
      console.log('=== AI RACE SEARCH RESULT (CLEANED) ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=======================================');

      return result;
    } catch (error) {
      console.error('=== AI RACE SEARCH ERROR ===');
      console.error(error);
      console.error('============================');
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

    // Include current race data if available - THIS IS THE FULL RACE CONTEXT
    if (options.currentRaceData) {
      const rd = options.currentRaceData;
      contextParts.push('=== CURRENT RACE DETAILS ===');
      if (rd.name) contextParts.push(`Name: ${rd.name}`);
      if (rd.date) contextParts.push(`Date: ${rd.date}`);
      if (rd.location) contextParts.push(`Location: ${rd.location}`);
      if (rd.country) contextParts.push(`Country: ${rd.country}`);
      if (rd.distanceKm !== null && rd.distanceKm !== undefined) contextParts.push(`Distance: ${rd.distanceKm} km`);
      if (rd.elevationGainM !== null && rd.elevationGainM !== undefined) contextParts.push(`Elevation Gain: ${rd.elevationGainM} m`);
      if (rd.elevationLossM !== null && rd.elevationLossM !== undefined) contextParts.push(`Elevation Loss: ${rd.elevationLossM} m`);
      if (rd.startTime) contextParts.push(`Start Time: ${rd.startTime}`);
      if (rd.startCutoffHours !== null && rd.startCutoffHours !== undefined) contextParts.push(`Start Cutoff: ${rd.startCutoffHours} hours`);
      if (rd.overallCutoffHours !== null && rd.overallCutoffHours !== undefined) contextParts.push(`Overall Cutoff: ${rd.overallCutoffHours} hours`);
      if (rd.description) contextParts.push(`Description: ${rd.description}`);
      if (rd.websiteUrl) contextParts.push(`Website: ${rd.websiteUrl}`);
      contextParts.push('');
    } else if (options.raceDistanceKm) {
      contextParts.push(`Race distance: ${options.raceDistanceKm} km`);
    }

    if (options.existingWaypoints && options.existingWaypoints.length > 0) {
      contextParts.push('=== EXISTING WAYPOINTS/AID STATIONS ===');
      options.existingWaypoints.forEach((wp, i) => {
        const parts = [
          `  ${i + 1}. "${wp.name}"`,
          wp.distanceKm !== null ? `at ${wp.distanceKm}km` : '',
          wp.waypointType ? `(${wp.waypointType})` : '',
          wp.elevationM !== null ? `elevation: ${wp.elevationM}m` : '',
          wp.cutoffHoursFromStart !== null && wp.cutoffHoursFromStart !== undefined ? `cutoff: ${wp.cutoffHoursFromStart}h` : '',
          wp.cutoffTime ? `cutoffTime: ${wp.cutoffTime}` : '',
        ].filter(Boolean);
        contextParts.push(parts.join(' '));
      });
      contextParts.push('');
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

    // Log the prompt being sent to the AI
    console.log('=== AI RACE UPDATE REQUEST ===');
    console.log('Instruction:', instruction);
    console.log('System Prompt:', RACE_UPDATE_SYSTEM_PROMPT);
    console.log('User Prompt:', userPrompt);
    console.log('==============================');

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

      // Log the raw AI response
      console.log('=== AI RACE UPDATE RESPONSE (RAW) ===');
      console.log(content);
      console.log('=====================================');

      const parsed = JSON.parse(content) as RaceUpdateResult;

      // Validate and clean the response
      const result = this.validateAndCleanUpdateResult(parsed);

      // Log the cleaned/validated result
      console.log('=== AI RACE UPDATE RESULT (CLEANED) ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=======================================');

      return result;
    } catch (error) {
      console.error('=== AI RACE UPDATE ERROR ===');
      console.error(error);
      console.error('============================');
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
