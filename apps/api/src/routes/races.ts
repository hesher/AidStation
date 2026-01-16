/**
 * Race Routes
 *
 * API endpoints for race-related operations including AI-powered race search.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { searchRace, RaceSearchResult, AidStationInfo } from '../services/ai';

// Request validation schemas
const searchRaceSchema = z.object({
  query: z.string().min(1, 'Race name is required').max(200),
  includeAidStations: z.boolean().optional().default(true),
  includeCourseData: z.boolean().optional().default(true),
});

type SearchRaceBody = z.infer<typeof searchRaceSchema>;

// Response types
interface RaceSearchResponse {
  success: boolean;
  data?: RaceSearchResult & {
    aidStations?: (AidStationInfo & {
      distanceFromPrevKm?: number;
      elevationGainFromPrevM?: number;
      elevationLossFromPrevM?: number;
    })[];
  };
  error?: string;
}

/**
 * Calculate derived metrics for aid stations (distance and elevation from previous station)
 */
function enrichAidStations(aidStations: AidStationInfo[]): (AidStationInfo & {
  distanceFromPrevKm?: number;
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
        elevationGainFromPrevM: station.elevationM ? station.elevationM : undefined,
        elevationLossFromPrevM: undefined,
      };
    }

    const prevStation = aidStations[index - 1];
    const distanceFromPrev = station.distanceKm - prevStation.distanceKm;

    let elevationGainFromPrev: number | undefined;
    let elevationLossFromPrev: number | undefined;

    if (station.elevationM !== undefined && prevStation.elevationM !== undefined) {
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
      distanceFromPrevKm: Math.round(distanceFromPrev * 100) / 100,
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
   * GET /api/races/:id
   *
   * Get a specific race by ID (from database)
   * TODO: Implement after database connection is set up
   */
  app.get('/races/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    reply.status(501);
    return {
      success: false,
      error: 'Not implemented yet',
    };
  });
}
