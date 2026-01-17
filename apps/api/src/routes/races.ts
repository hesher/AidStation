/**
 * Race Routes
 *
 * API endpoints for race-related operations including AI-powered race search,
 * race persistence, and session management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { searchRace, RaceSearchResult, AidStationInfo } from '../services/ai';
import {
  createRace,
  getRaceById,
  updateRace,
  deleteRace,
  getOrCreateSessionUser,
  upsertSession,
  getLastRaceId,
  searchRaces,
  getUniqueCountries,
  getRaceVersionHistory,
  getRaceVersion,
  restoreRaceVersion,
  type AidStationData,
  type SessionData,
} from '../db/repositories';
import { TaskQueue, CourseAnalysisResult } from '../services/queue/task-queue';
import { logSuccess, logFailure } from '../utils/logger';

// Request validation schemas
const searchRaceSchema = z.object({
  query: z.string().min(1, 'Race name is required').max(200),
  includeAidStations: z.boolean().optional().default(true),
  includeCourseData: z.boolean().optional().default(true),
});

const saveRaceSchema = z.object({
  name: z.string().min(1),
  date: z.string().nullish(),
  location: z.string().nullish(),
  country: z.string().nullish(),
  distanceKm: z.number().nullish(),
  elevationGainM: z.number().nullish(),
  elevationLossM: z.number().nullish(),
  startTime: z.string().nullish(),
  overallCutoffHours: z.number().nullish(),
  description: z.string().nullish(),
  websiteUrl: z.string().nullish(),
  isPublic: z.boolean().optional().default(false),
  aidStations: z.array(z.object({
    name: z.string(),
    distanceKm: z.number().nullish(),
    distanceFromPrevKm: z.number().nullish(),
    elevationM: z.number().nullish(),
    elevationGainFromPrevM: z.number().nullish(),
    elevationLossFromPrevM: z.number().nullish(),
    hasDropBag: z.boolean().nullish(),
    hasCrew: z.boolean().nullish(),
    hasPacer: z.boolean().nullish(),
    cutoffTime: z.string().nullish(),
    cutoffHoursFromStart: z.number().nullish(),
  })).optional(),
  courseCoordinates: z.array(z.object({
    lat: z.number(),
    lon: z.number(),
    elevation: z.number().optional(),
  })).optional(),
});

const updateRaceSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().nullish(),
  location: z.string().nullish(),
  country: z.string().nullish(),
  distanceKm: z.number().nullish(),
  elevationGainM: z.number().nullish(),
  elevationLossM: z.number().nullish(),
  startTime: z.string().nullish(),
  overallCutoffHours: z.number().nullish(),
  description: z.string().nullish(),
  websiteUrl: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  aidStations: z.array(z.object({
    name: z.string(),
    distanceKm: z.number().nullish(),
    distanceFromPrevKm: z.number().nullish(),
    elevationM: z.number().nullish(),
    elevationGainFromPrevM: z.number().nullish(),
    elevationLossFromPrevM: z.number().nullish(),
    hasDropBag: z.boolean().nullish(),
    hasCrew: z.boolean().nullish(),
    hasPacer: z.boolean().nullish(),
    cutoffTime: z.string().nullish(),
    cutoffHoursFromStart: z.number().nullish(),
  })).nullish(),
  courseCoordinates: z.array(z.object({
    lat: z.number(),
    lon: z.number(),
    elevation: z.number().optional(),
  })).nullish(),
});

// List races query schema - for future use when query validation is added
// eslint-disable-next-line @typescript-eslint/no-unused-vars

type SearchRaceBody = z.infer<typeof searchRaceSchema>;
type SaveRaceBody = z.infer<typeof saveRaceSchema>;

// Session ID cookie name
const SESSION_COOKIE = 'aidstation_session';

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Get or create session ID from request
 */
function getSessionId(request: FastifyRequest): string {
  const cookies = request.cookies || {};
  return cookies[SESSION_COOKIE] || generateSessionId();
}

// Response types
interface RaceSearchResponse {
  success: boolean;
  data?: RaceSearchResult & {
    id?: string;
    aidStations?: (AidStationInfo & {
      distanceFromPrevKm?: number | null;
      elevationGainFromPrevM?: number;
      elevationLossFromPrevM?: number;
    })[];
  };
  error?: string;
}

interface RaceResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    date?: string | null;
    location?: string | null;
    country?: string | null;
    distanceKm?: number | null;
    elevationGainM?: number | null;
    elevationLossM?: number | null;
    startTime?: string | null;
    overallCutoffHours?: number | null;
    aidStations?: AidStationData[];
    courseCoordinates?: Array<{ lat: number; lon: number; elevation?: number }>;
  };
  error?: string;
}

/**
 * Calculate derived metrics for aid stations (distance and elevation from previous station)
 */
function enrichAidStations(aidStations: AidStationInfo[]): (AidStationInfo & {
  distanceFromPrevKm?: number | null;
  elevationGainFromPrevM?: number;
  elevationLossFromPrevM?: number;
})[] {
  if (!aidStations || aidStations.length === 0) {
    return [];
  }

  return aidStations.map((station, index) => {
    if (index === 0) {
      return {
        ...station,
        distanceFromPrevKm: station.distanceKm,
        elevationGainFromPrevM: station.elevationM != null ? station.elevationM : undefined,
        elevationLossFromPrevM: undefined,
      };
    }

    const prevStation = aidStations[index - 1];

    // Calculate distance from previous (only if both values are known)
    let distanceFromPrev: number | null = null;
    if (station.distanceKm != null && prevStation.distanceKm != null) {
      distanceFromPrev = Math.round((station.distanceKm - prevStation.distanceKm) * 100) / 100;
    }

    let elevationGainFromPrev: number | undefined;
    let elevationLossFromPrev: number | undefined;

    if (station.elevationM != null && prevStation.elevationM != null) {
      const elevDiff = station.elevationM - prevStation.elevationM;
      if (elevDiff > 0) {
        elevationGainFromPrev = elevDiff;
        elevationLossFromPrev = 0;
      } else {
        elevationGainFromPrev = 0;
        elevationLossFromPrev = Math.abs(elevDiff);
      }
    }

    return {
      ...station,
      distanceFromPrevKm: distanceFromPrev,
      elevationGainFromPrevM: elevationGainFromPrev,
      elevationLossFromPrevM: elevationLossFromPrev,
    };
  });
}

export async function raceRoutes(app: FastifyInstance) {
  /**
   * POST /api/races/search
   *
   * Search for race information using AI
   */
  app.post('/races/search', async (
    request: FastifyRequest<{ Body: SearchRaceBody }>,
    reply: FastifyReply
  ): Promise<RaceSearchResponse> => {
    try {
      // Validate request body
      const validatedBody = searchRaceSchema.parse(request.body);

      app.log.info({ query: validatedBody.query }, 'Searching for race');

      // Call AI service to search for race
      const result = await searchRace(validatedBody.query, {
        includeAidStations: validatedBody.includeAidStations,
        includeCourseData: validatedBody.includeCourseData,
      });

      // Enrich aid stations with calculated metrics
      const enrichedResult = {
        ...result,
        aidStations: result.aidStations
          ? enrichAidStations(result.aidStations)
          : undefined,
      };

      logSuccess(app, 'Race search', { raceName: result.name, query: validatedBody.query });

      return {
        success: true,
        data: enrichedResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Race search', errorMessage);

      reply.status(error instanceof z.ZodError ? 400 : 500);

      return {
        success: false,
        error: error instanceof z.ZodError
          ? error.errors.map(e => e.message).join(', ')
          : errorMessage,
      };
    }
  });

  /**
   * POST /api/races
   *
   * Save a race to the database and update session
   */
  app.post('/races', async (
    request: FastifyRequest<{ Body: SaveRaceBody }>,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const validatedBody = saveRaceSchema.parse(request.body);

      // Get or create session
      const sessionId = getSessionId(request);

      // Get or create user for session
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        // Database might not be available, log and continue without persistence
        app.log.warn({ error: dbError }, 'Database not available, skipping persistence');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available. Please ensure PostgreSQL is running.',
        };
      }

      // Create race in database
      const race = await createRace(
        {
          name: validatedBody.name,
          date: validatedBody.date,
          location: validatedBody.location,
          country: validatedBody.country,
          distanceKm: validatedBody.distanceKm,
          elevationGainM: validatedBody.elevationGainM,
          elevationLossM: validatedBody.elevationLossM,
          startTime: validatedBody.startTime,
          overallCutoffHours: validatedBody.overallCutoffHours,
          ownerId: userId,
          metadata: {
            description: validatedBody.description,
            websiteUrl: validatedBody.websiteUrl,
          },
          courseCoordinates: validatedBody.courseCoordinates,
        },
        validatedBody.aidStations as AidStationData[]
      );

      // Update session with last viewed race
      const sessionData: SessionData = {
        lastRaceId: race.id,
        courseCoordinates: validatedBody.courseCoordinates,
      };
      await upsertSession(userId, race.id, sessionData);

      logSuccess(app, 'Race created', { raceId: race.id, raceName: race.name });

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });

      return {
        success: true,
        data: {
          id: race.id,
          name: race.name,
          date: race.date?.toISOString(),
          location: race.location,
          country: race.country,
          distanceKm: race.distanceKm,
          elevationGainM: race.elevationGainM,
          elevationLossM: race.elevationLossM,
          startTime: race.startTime,
          overallCutoffHours: race.overallCutoffHours,
          aidStations: race.aidStations.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })),
          courseCoordinates: validatedBody.courseCoordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Race create', errorMessage);

      reply.status(error instanceof z.ZodError ? 400 : 500);

      return {
        success: false,
        error: error instanceof z.ZodError
          ? error.errors.map(e => e.message).join(', ')
          : errorMessage,
      };
    }
  });

  /**
   * GET /api/races/current
   *
   * Get the current/last viewed race for the session
   */
  app.get('/races/current', async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const sessionId = getSessionId(request);

      // Get user for session
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      // Get last race ID from session
      const lastRaceId = await getLastRaceId(userId);

      if (!lastRaceId) {
        reply.status(404);
        return {
          success: false,
          error: 'No previous race found',
        };
      }

      // Get race with aid stations
      const race = await getRaceById(lastRaceId);

      if (!race) {
        reply.status(404);
        return {
          success: false,
          error: 'Race not found',
        };
      }

      // Get course coordinates from session data or metadata
      const metadata = race.metadata as Record<string, unknown> | null;
      const courseCoordinates = metadata?.courseCoordinates as Array<{ lat: number; lon: number; elevation?: number }> | undefined;

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      return {
        success: true,
        data: {
          id: race.id,
          name: race.name,
          date: race.date?.toISOString(),
          location: race.location,
          country: race.country,
          distanceKm: race.distanceKm,
          elevationGainM: race.elevationGainM,
          elevationLossM: race.elevationLossM,
          startTime: race.startTime,
          overallCutoffHours: race.overallCutoffHours,
          aidStations: race.aidStations.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })),
          courseCoordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get current race', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/races/:id
   *
   * Get a specific race by ID (from database)
   */
  app.get('/races/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const { id } = request.params;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid race ID format',
        };
      }

      let race;
      try {
        race = await getRaceById(id);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      if (!race) {
        reply.status(404);
        return {
          success: false,
          error: 'Race not found',
        };
      }

      const metadata = race.metadata as Record<string, unknown> | null;
      const courseCoordinates = metadata?.courseCoordinates as Array<{ lat: number; lon: number; elevation?: number }> | undefined;

      return {
        success: true,
        data: {
          id: race.id,
          name: race.name,
          date: race.date?.toISOString(),
          location: race.location,
          country: race.country,
          distanceKm: race.distanceKm,
          elevationGainM: race.elevationGainM,
          elevationLossM: race.elevationLossM,
          startTime: race.startTime,
          overallCutoffHours: race.overallCutoffHours,
          aidStations: race.aidStations.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })),
          courseCoordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get race', error instanceof Error ? error : errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * DELETE /api/races/:id
   *
   * Delete a race
   */
  app.delete('/races/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { id } = request.params;

      const deleted = await deleteRace(id);

      if (!deleted) {
        reply.status(404);
        return {
          success: false,
          error: 'Race not found',
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Delete race', errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * PUT /api/races/:id
   *
   * Update an existing race
   */
  app.put('/races/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof updateRaceSchema> }>,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const { id } = request.params;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid race ID format',
        };
      }

      const validatedBody = updateRaceSchema.parse(request.body);

      // Check if race exists
      let existingRace;
      try {
        existingRace = await getRaceById(id);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      if (!existingRace) {
        reply.status(404);
        return {
          success: false,
          error: 'Race not found',
        };
      }

      // Update the race with aid stations
      const race = await updateRace(
        id,
        {
          name: validatedBody.name,
          date: validatedBody.date,
          location: validatedBody.location,
          country: validatedBody.country,
          distanceKm: validatedBody.distanceKm,
          elevationGainM: validatedBody.elevationGainM,
          elevationLossM: validatedBody.elevationLossM,
          startTime: validatedBody.startTime,
          overallCutoffHours: validatedBody.overallCutoffHours,
          isPublic: validatedBody.isPublic ?? undefined,
          metadata: {
            description: validatedBody.description,
            websiteUrl: validatedBody.websiteUrl,
            courseCoordinates: validatedBody.courseCoordinates,
          },
        },
        validatedBody.aidStations as AidStationData[] | undefined
      );

      if (!race) {
        reply.status(500);
        return {
          success: false,
          error: 'Failed to update race',
        };
      }

      const metadata = race.metadata as Record<string, unknown> | null;
      const courseCoordinates = metadata?.courseCoordinates as Array<{ lat: number; lon: number; elevation?: number }> | undefined;

      return {
        success: true,
        data: {
          id: race.id,
          name: race.name,
          date: race.date?.toISOString(),
          location: race.location,
          country: race.country,
          distanceKm: race.distanceKm,
          elevationGainM: race.elevationGainM,
          elevationLossM: race.elevationLossM,
          startTime: race.startTime,
          overallCutoffHours: race.overallCutoffHours,
          aidStations: race.aidStations.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })),
          courseCoordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Update race', errorMessage, { id: request.params.id });

      reply.status(error instanceof z.ZodError ? 400 : 500);

      return {
        success: false,
        error: error instanceof z.ZodError
          ? error.errors.map(e => e.message).join(', ')
          : errorMessage,
      };
    }
  });

  /**
   * GET /api/races
   *
   * List races with search and filtering
   */
  app.get('/races', async (
    request: FastifyRequest<{ Querystring: { search?: string; country?: string; limit?: string; offset?: string } }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; data?: { races: unknown[]; total: number }; error?: string }> => {
    try {
      const query = request.query;
      const sessionId = getSessionId(request);

      // Get user for session
      let userId: string | undefined;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        // Database not available - no user filtering
        app.log.warn({ error: dbError }, 'Database not available for user lookup');
      }

      // Parse query params
      const search = query.search?.trim();
      const country = query.country?.trim();
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      let result;
      try {
        result = await searchRaces({
          userId,
          search,
          country,
          includePublic: true,
          limit: Math.min(limit, 100),
          offset: Math.max(offset, 0),
        });
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      return {
        success: true,
        data: {
          races: result.races.map((race) => ({
            id: race.id,
            name: race.name,
            date: race.date?.toISOString(),
            location: race.location,
            country: race.country,
            distanceKm: race.distanceKm,
            isPublic: race.isPublic,
          })),
          total: result.total,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'List races', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/races/countries
   *
   * Get list of unique countries for filtering
   */
  app.get('/races/countries', async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ success: boolean; data?: string[]; error?: string }> => {
    try {
      let countries: string[];
      try {
        countries = await getUniqueCountries();
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      return {
        success: true,
        data: countries,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get countries', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * POST /api/races/analyze-gpx
   *
   * Analyze a GPX file to extract course metrics (distance, elevation, etc.)
   * This sends the GPX to the Python worker for processing and returns the results.
   */
  app.post('/races/analyze-gpx', async (
    request: FastifyRequest<{
      Body: {
        gpxContent: string;
        aidStations?: Array<{ name: string; distanceKm?: number; lat?: number; lon?: number }>;
      };
    }>,
    reply: FastifyReply
  ): Promise<{
    success: boolean;
    data?: {
      courseStats?: CourseAnalysisResult['course_stats'];
      elevationProfile?: CourseAnalysisResult['elevation_profile'];
      aidStations?: CourseAnalysisResult['aid_stations'];
      coordinates?: CourseAnalysisResult['coordinates'];
    };
    error?: string;
  }> => {
    try {
      const { gpxContent, aidStations } = request.body;

      if (!gpxContent || typeof gpxContent !== 'string') {
        reply.status(400);
        return {
          success: false,
          error: 'GPX content is required',
        };
      }

      app.log.info({ gpxLength: gpxContent.length, aidStationsCount: aidStations?.length }, 'Analyzing GPX course');

      // Check if Python worker is connected
      if (!TaskQueue.isConnected()) {
        app.log.warn('Python worker not connected, returning parsed coordinates only');
        reply.status(503);
        return {
          success: false,
          error: 'Analysis service not available. GPX was parsed but advanced metrics could not be calculated.',
        };
      }

      // Submit GPX to Python worker for analysis
      const result = await TaskQueue.analyzeGpxCourse(gpxContent, aidStations);

      if (result.status !== 'SUCCESS' || !result.result) {
        app.log.error({ error: result.error, status: result.status }, 'GPX analysis failed');
        reply.status(500);
        return {
          success: false,
          error: result.error || 'Failed to analyze GPX file',
        };
      }

      const analysisResult = result.result;

      if (!analysisResult.success) {
        reply.status(500);
        return {
          success: false,
          error: analysisResult.error || 'GPX analysis returned an error',
        };
      }

      return {
        success: true,
        data: {
          courseStats: analysisResult.course_stats,
          elevationProfile: analysisResult.elevation_profile,
          aidStations: analysisResult.aid_stations,
          coordinates: analysisResult.coordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'GPX analysis', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/races/:id/versions
   *
   * Get version history for a race
   */
  app.get('/races/:id/versions', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; data?: { versions: unknown[]; total: number; currentVersion?: number }; error?: string }> => {
    try {
      const { id } = request.params;
      const query = request.query;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid race ID format',
        };
      }

      // Get current race to get current version number
      let currentRace;
      try {
        currentRace = await getRaceById(id);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      if (!currentRace) {
        reply.status(404);
        return {
          success: false,
          error: 'Race not found',
        };
      }

      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const result = await getRaceVersionHistory(id, { limit, offset });

      return {
        success: true,
        data: {
          versions: result.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            name: v.name,
            date: v.date?.toISOString(),
            location: v.location,
            country: v.country,
            distanceKm: v.distanceKm,
            elevationGainM: v.elevationGainM,
            elevationLossM: v.elevationLossM,
            changeSummary: v.changeSummary,
            createdAt: v.createdAt.toISOString(),
            aidStationCount: v.aidStationsSnapshot?.length ?? 0,
          })),
          total: result.total,
          currentVersion: (currentRace as unknown as { version_number?: number }).version_number ?? 1,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get race versions', errorMessage, { id: (request.params as { id: string }).id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/races/:id/versions/:version
   *
   * Get a specific version of a race
   */
  app.get('/races/:id/versions/:version', async (
    request: FastifyRequest<{ Params: { id: string; version: string } }>,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const { id, version } = request.params;
      const versionNumber = parseInt(version, 10);

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid race ID format',
        };
      }

      if (isNaN(versionNumber) || versionNumber < 1) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid version number',
        };
      }

      const raceVersion = await getRaceVersion(id, versionNumber);

      if (!raceVersion) {
        reply.status(404);
        return {
          success: false,
          error: 'Version not found',
        };
      }

      return {
        success: true,
        data: {
          id: raceVersion.id,
          name: raceVersion.name,
          date: raceVersion.date?.toISOString(),
          location: raceVersion.location,
          country: raceVersion.country,
          distanceKm: raceVersion.distanceKm,
          elevationGainM: raceVersion.elevationGainM,
          elevationLossM: raceVersion.elevationLossM,
          startTime: raceVersion.startTime,
          overallCutoffHours: raceVersion.overallCutoffHours,
          aidStations: raceVersion.aidStationsSnapshot?.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })) ?? [],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get race version', errorMessage, { id: (request.params as { id: string }).id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * POST /api/races/:id/versions/:version/restore
   *
   * Restore a race to a specific version
   */
  app.post('/races/:id/versions/:version/restore', async (
    request: FastifyRequest<{ Params: { id: string; version: string } }>,
    reply: FastifyReply
  ): Promise<RaceResponse> => {
    try {
      const { id, version } = request.params;
      const versionNumber = parseInt(version, 10);

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid race ID format',
        };
      }

      if (isNaN(versionNumber) || versionNumber < 1) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid version number',
        };
      }

      const restoredRace = await restoreRaceVersion(id, versionNumber);

      if (!restoredRace) {
        reply.status(404);
        return {
          success: false,
          error: 'Version not found or could not be restored',
        };
      }

      logSuccess(app, 'Race version restored', { raceId: id, restoredVersion: versionNumber });

      const metadata = restoredRace.metadata as Record<string, unknown> | null;
      const courseCoordinates = metadata?.courseCoordinates as Array<{ lat: number; lon: number; elevation?: number }> | undefined;

      return {
        success: true,
        data: {
          id: restoredRace.id,
          name: restoredRace.name,
          date: restoredRace.date?.toISOString(),
          location: restoredRace.location,
          country: restoredRace.country,
          distanceKm: restoredRace.distanceKm,
          elevationGainM: restoredRace.elevationGainM,
          elevationLossM: restoredRace.elevationLossM,
          startTime: restoredRace.startTime,
          overallCutoffHours: restoredRace.overallCutoffHours,
          aidStations: restoredRace.aidStations.map((as) => ({
            name: as.name,
            distanceKm: as.distanceKm,
            distanceFromPrevKm: as.distanceFromPrevKm ?? undefined,
            elevationM: as.elevationM ?? undefined,
            elevationGainFromPrevM: as.elevationGainFromPrevM ?? undefined,
            elevationLossFromPrevM: as.elevationLossFromPrevM ?? undefined,
            hasDropBag: as.hasDropBag ?? undefined,
            hasCrew: as.hasCrew ?? undefined,
            hasPacer: as.hasPacer ?? undefined,
            cutoffTime: as.cutoffTime ?? undefined,
            cutoffHoursFromStart: as.cutoffHoursFromStart ?? undefined,
          })),
          courseCoordinates,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Restore race version', errorMessage, { id: (request.params as { id: string }).id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
}
