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
  type AidStationData,
  type SessionData,
} from '../db/repositories';

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
  date: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  distanceKm: z.number().optional(),
  elevationGainM: z.number().optional(),
  elevationLossM: z.number().optional(),
  startTime: z.string().optional(),
  overallCutoffHours: z.number().optional(),
  description: z.string().optional(),
  websiteUrl: z.string().optional(),
  isPublic: z.boolean().optional(),
});

// List races query schema - for future use when query validation is added
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _listRacesSchema = z.object({
  search: z.string().optional(),
  country: z.string().optional(),
  includePublic: z.boolean().optional().default(true),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

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

      return {
        success: true,
        data: enrichedResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      app.log.error({ error: errorMessage }, 'Race search failed');

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

      app.log.error({ error: errorMessage }, 'Failed to save race');

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

      app.log.error({ error: errorMessage }, 'Failed to get current race');

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

      app.log.error({ error: errorMessage }, 'Failed to get race');

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

      app.log.error({ error: errorMessage }, 'Failed to delete race');

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

      // Update the race
      const updatedRace = await updateRace(id, {
        name: validatedBody.name,
        date: validatedBody.date,
        location: validatedBody.location,
        country: validatedBody.country,
        distanceKm: validatedBody.distanceKm,
        elevationGainM: validatedBody.elevationGainM,
        elevationLossM: validatedBody.elevationLossM,
        startTime: validatedBody.startTime,
        overallCutoffHours: validatedBody.overallCutoffHours,
        isPublic: validatedBody.isPublic,
        metadata: {
          description: validatedBody.description,
          websiteUrl: validatedBody.websiteUrl,
        },
      });

      if (!updatedRace) {
        reply.status(500);
        return {
          success: false,
          error: 'Failed to update race',
        };
      }

      // Get full race with aid stations
      const race = await getRaceById(id);

      if (!race) {
        reply.status(500);
        return {
          success: false,
          error: 'Failed to retrieve updated race',
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

      app.log.error({ error: errorMessage }, 'Failed to update race');

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

      app.log.error({ error: errorMessage }, 'Failed to list races');

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

      app.log.error({ error: errorMessage }, 'Failed to get countries');

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
}
