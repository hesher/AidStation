/**
 * Plans Routes
 *
 * API routes for race plan management and prediction generation.
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createPlan,
  getPlanById,
  getPlansByUser,
  getPlansByRace,
  updatePlan,
  updatePlanPredictions,
  deletePlan,
  getRaceForPrediction,
  getUserPerformanceForPrediction,
  setActivePlan,
  getOrCreateSessionUser,
  AidStationPrediction,
} from '../db/repositories';
import { logSuccess, logFailure } from '../utils/logger';

// Session cookie name
const SESSION_COOKIE = 'aidstation_session';

function getSessionId(request: FastifyRequest): string {
  const cookies = request.cookies || {};
  return cookies[SESSION_COOKIE] || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Validation schemas
const createPlanSchema = z.object({
  raceId: z.string().uuid(),
  name: z.string().optional(),
  basePaceMinKm: z.number().positive().optional(),
  nighttimeSlowdown: z.number().min(0).max(1).optional(),
  startTime: z.string().datetime().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().optional(),
  basePaceMinKm: z.number().positive().optional(),
  nighttimeSlowdown: z.number().min(0).max(1).optional(),
  startTime: z.string().datetime().optional(),
});

export async function planRoutes(app: FastifyInstance) {
  /**
   * Create a new race plan
   * POST /api/plans
   */
  app.post('/plans', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const body = createPlanSchema.parse(request.body);

      // Verify race exists
      const raceData = await getRaceForPrediction(body.raceId);
      if (!raceData) {
        return reply.status(404).send({
          success: false,
          error: 'Race not found',
        });
      }

      const plan = await createPlan({
        userId,
        raceId: body.raceId,
        name: body.name ?? `${raceData.race.name} Plan`,
        basePaceMinKm: body.basePaceMinKm,
        nighttimeSlowdown: body.nighttimeSlowdown,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
      });

      logSuccess(app, 'Plan created', { planId: plan.id, name: plan.name });

      return reply.status(201).send({
        success: true,
        data: plan,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      logFailure(app, 'Plan create', error instanceof Error ? error : 'Unknown error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create plan',
      });
    }
  });

  /**
   * Get all plans for the current user
   * GET /api/plans
   */
  app.get('/plans', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const query = request.query as { limit?: string; offset?: string };

      const { plans, total } = await getPlansByUser(userId, {
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });

      logSuccess(app, 'Plans listed', { count: plans.length, total });

      return reply.send({
        success: true,
        data: { plans, total },
      });
    } catch (error) {
      logFailure(app, 'List plans', error instanceof Error ? error : 'Unknown error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch plans',
      });
    }
  });

  /**
   * Get a specific plan by ID
   * GET /api/plans/:id
   */
  app.get('/plans/:id', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { id } = request.params as { id: string };
      const plan = await getPlanById(id);

      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }

      // Verify ownership
      if (plan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      logSuccess(app, 'Plan retrieved', { planId: plan.id });

      return reply.send({
        success: true,
        data: plan,
      });
    } catch (error) {
      logFailure(app, 'Get plan', error instanceof Error ? error : 'Unknown error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch plan',
      });
    }
  });

  /**
   * Get plans for a specific race
   * GET /api/plans/race/:raceId
   */
  app.get('/plans/race/:raceId', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { raceId } = request.params as { raceId: string };

      const plans = await getPlansByRace(userId, raceId);

      logSuccess(app, 'Plans listed for race', { raceId, count: plans.length });

      return reply.send({
        success: true,
        data: { plans },
      });
    } catch (error) {
      logFailure(app, 'List plans by race', error instanceof Error ? error : 'Unknown error');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch plans',
      });
    }
  });

  /**
   * Update a plan
   * PUT /api/plans/:id
   */
  app.put('/plans/:id', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { id } = request.params as { id: string };
      const body = updatePlanSchema.parse(request.body);

      // Verify ownership
      const existingPlan = await getPlanById(id);
      if (!existingPlan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }
      if (existingPlan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const updated = await updatePlan(id, {
        ...body,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
      });

      logSuccess(app, 'Plan updated', { planId: id });

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      logFailure(app, 'Update plan', error instanceof Error ? error : 'Unknown error', { id: (request.params as { id: string }).id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to update plan',
      });
    }
  });

  /**
   * Delete a plan
   * DELETE /api/plans/:id
   */
  app.delete('/plans/:id', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { id } = request.params as { id: string };

      // Verify ownership
      const existingPlan = await getPlanById(id);
      if (!existingPlan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }
      if (existingPlan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      await deletePlan(id);

      logSuccess(app, 'Plan deleted', { planId: id });

      return reply.send({
        success: true,
        message: 'Plan deleted',
      });
    } catch (error) {
      logFailure(app, 'Delete plan', error instanceof Error ? error : 'Unknown error', { id: (request.params as { id: string }).id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete plan',
      });
    }
  });

  /**
   * Generate predictions for a plan
   * POST /api/plans/:id/predict
   */
  app.post('/plans/:id/predict', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { id } = request.params as { id: string };

      // Verify ownership
      const plan = await getPlanById(id);
      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }
      if (plan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      // Get race data
      const raceData = await getRaceForPrediction(plan.raceId);
      if (!raceData) {
        return reply.status(404).send({
          success: false,
          error: 'Race not found',
        });
      }

      // Get user performance profile
      const performanceRaw = await getUserPerformanceForPrediction(userId);

      // Extract pace profiles from profileData if available
      const performance = performanceRaw ? {
        ...performanceRaw,
        paceDecayByProgressPct: (performanceRaw.profileData?.paceDecayByProgressPct as Record<string, number> | undefined) ?? null,
        paceByDistanceTable: (performanceRaw.profileData?.paceByDistanceTable as Array<{
          distanceKm: number;
          paceMinKm: number;
          gapMinKm: number;
          sampleCount: number;
        }> | undefined) ?? null,
      } : null;

      // Debug logging to trace the performance profile values
      app.log.info({
        userId,
        performanceFound: performance !== null,
        performance: performance ? {
          flatPaceMinKm: performance.flatPaceMinKm,
          climbingPaceMinKm: performance.climbingPaceMinKm,
          descendingPaceMinKm: performance.descendingPaceMinKm,
          fatigueFactor: performance.fatigueFactor,
          hasPaceDecayProfile: !!performance.paceDecayByProgressPct && Object.keys(performance.paceDecayByProgressPct).length > 0,
          hasPaceByDistanceTable: !!performance.paceByDistanceTable && performance.paceByDistanceTable.length > 0,
          paceByDistanceEntries: performance.paceByDistanceTable?.length ?? 0,
        } : null,
      }, 'Performance profile for prediction');

      // Generate predictions
      const predictions = generatePredictions(
        raceData,
        performance,
        {
          basePaceMinKm: plan.basePaceMinKm,
          nighttimeSlowdown: plan.nighttimeSlowdown ?? 0.15,
          startTime: plan.startTime,
        }
      );

      // Update plan with predictions
      const updatedPlan = await updatePlanPredictions(id, predictions);

      logSuccess(app, 'Predictions generated', { planId: id, stationCount: predictions.aidStationPredictions.length });

      return reply.send({
        success: true,
        data: updatedPlan,
      });
    } catch (error) {
      logFailure(app, 'Generate predictions', error instanceof Error ? error : 'Unknown error', { id: (request.params as { id: string }).id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate predictions',
      });
    }
  });

  /**
   * Set a plan as active
   * POST /api/plans/:id/activate
   */
  app.post('/plans/:id/activate', async (request, reply) => {
    try {
      const sessionId = getSessionId(request);
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        return reply.status(503).send({
          success: false,
          error: 'Database not available',
        });
      }

      const { id } = request.params as { id: string };

      // Verify ownership
      const plan = await getPlanById(id);
      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }
      if (plan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      await setActivePlan(id, userId, plan.raceId);

      logSuccess(app, 'Plan activated', { planId: id });

      return reply.send({
        success: true,
        message: 'Plan activated',
      });
    } catch (error) {
      logFailure(app, 'Activate plan', error instanceof Error ? error : 'Unknown error', { id: (request.params as { id: string }).id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to activate plan',
      });
    }
  });
}

/**
 * Calculate default aid station stop time based on race distance and station type.
 *
 * Ultra-race research suggests:
 * - Short races (<50km): 2-5 min per station (quick refuel)
 * - Medium races (50-100km): 5-10 min per station (refuel + minor care)
 * - Long races (100-160km): 8-15 min per station (full service)
 * - Very long races (>160km): 10-20 min per station (extended care, potential sleep)
 *
 * @param totalDistanceKm Total race distance
 * @param hasDropBag Whether the station has a drop bag (adds time)
 * @param hasCrew Whether the station has crew access (adds time)
 * @returns Recommended stop time in minutes
 */
function getDefaultAidStationMinutes(
  totalDistanceKm: number,
  hasDropBag = false,
  hasCrew = false
): number {
  let baseMinutes: number;

  if (totalDistanceKm <= 50) {
    baseMinutes = 3;
  } else if (totalDistanceKm <= 100) {
    baseMinutes = 6;
  } else if (totalDistanceKm <= 160) {
    baseMinutes = 10;
  } else {
    baseMinutes = 15;
  }

  // Add time for drop bags (gathering gear, changing clothes)
  if (hasDropBag) {
    baseMinutes += 5;
  }

  // Add time for crew (more efficient but also more socializing)
  if (hasCrew) {
    baseMinutes += 3;
  }

  return baseMinutes;
}

/**
 * Generate predictions for aid station arrival times
 */
function generatePredictions(
  raceData: {
    race: {
      id: string;
      name: string;
      distanceKm: number | null;
      startTime: string | null;
      overallCutoffHours: number | null;
    };
    aidStations: Array<{
      id: string;
      name: string;
      distanceKm: number | null;
      distanceFromPrevKm: number | null;
      elevationGainFromPrevM: number | null;
      elevationLossFromPrevM: number | null;
      cutoffHoursFromStart: number | null;
      cutoffTime: string | null;
      hasDropBag?: boolean;
      hasCrew?: boolean;
    }>;
  },
  performance: {
    flatPaceMinKm: number;
    climbingPaceMinKm: number;
    descendingPaceMinKm: number;
    fatigueFactor: number;
    paceDecayByProgressPct?: Record<string, number> | null;
    paceByDistanceTable?: Array<{
      distanceKm: number;
      paceMinKm: number;
      gapMinKm: number;
      sampleCount: number;
    }> | null;
  } | null,
  options: {
    basePaceMinKm?: number | null;
    nighttimeSlowdown: number;
    startTime?: Date | null;
    defaultAidStationMinutes?: number | null; // Override auto-calculated stop time
  }
): {
  aidStationPredictions: AidStationPrediction[];
  predictedTotalMinutes: number;
  predictedFinishTime: Date;
} {
  // Default performance values to use when no profile exists or values are null
  const DEFAULT_FLAT_PACE = 6.5;
  const DEFAULT_CLIMBING_PACE = 12.0;
  const DEFAULT_DESCENDING_PACE = 5.5;
  const DEFAULT_FATIGUE_FACTOR = 1.08;

  // Use user's performance profile if available, with fallbacks to defaults
  // Note: fatigueFactor from the profile is a percentage change per 10km (can be negative)
  // We need to convert it to a multiplier format (1.0 + factor) and ensure it's positive
  const rawFatigueFactor = performance?.fatigueFactor ?? 0;
  // Convert: if raw is 2.0 (2% slowdown per 10km), we want ~1.08 for total race
  // If raw is negative (speed up), clamp to minimum positive value
  const normalizedFatigueFactor = rawFatigueFactor < 0
    ? DEFAULT_FATIGUE_FACTOR  // Use default if user appears to speed up (invalid)
    : 1.0 + Math.min(rawFatigueFactor / 100, 0.20);  // Cap at 20% slowdown

  const perf = {
    flatPaceMinKm: performance?.flatPaceMinKm ?? DEFAULT_FLAT_PACE,
    climbingPaceMinKm: performance?.climbingPaceMinKm ?? DEFAULT_CLIMBING_PACE,
    descendingPaceMinKm: performance?.descendingPaceMinKm ?? DEFAULT_DESCENDING_PACE,
    fatigueFactor: normalizedFatigueFactor,
    paceDecayByProgressPct: performance?.paceDecayByProgressPct ?? null,
    paceByDistanceTable: performance?.paceByDistanceTable ?? null,
  };

  // Helper function to look up pace at a given distance from the distance-based pace table
  // This uses actual historical data: "At km X, you typically run Y pace"
  //
  // For extrapolation beyond known data, we use RIEGEL'S POWER LAW:
  //   P_target = P_known × (D_target / D_known)^(f-1)
  //
  // Where f is the fatigue factor:
  //   - 1.06: Elite marathon runners (standard Riegel)
  //   - 1.10-1.15: Good ultra runners
  //   - 1.20+: Back-of-pack / First-timers
  //
  // Default f=1.15 is a reasonable middle ground for trained ultra runners
  const RIEGEL_FATIGUE_FACTOR = 1.15;

  function getPaceAtDistance(distanceKm: number): { pace: number; isExtrapolated: boolean } | null {
    if (!perf.paceByDistanceTable || perf.paceByDistanceTable.length === 0) {
      return null;
    }

    const maxDataDistance = perf.paceByDistanceTable[perf.paceByDistanceTable.length - 1].distanceKm;

    // If within known data range, find closest entry
    if (distanceKm <= maxDataDistance) {
      let closestEntry = perf.paceByDistanceTable[0];
      let closestDistance = Math.abs(closestEntry.distanceKm - distanceKm);

      for (const entry of perf.paceByDistanceTable) {
        const distance = Math.abs(entry.distanceKm - distanceKm);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEntry = entry;
        }
      }

      return { pace: closestEntry.gapMinKm, isExtrapolated: false };
    }

    // EXTRAPOLATION using Riegel's Power Law
    // P_target = P_known × (D_target / D_known)^(f-1)
    const lastEntry = perf.paceByDistanceTable[perf.paceByDistanceTable.length - 1];
    const knownPace = lastEntry.gapMinKm;
    const knownDistance = lastEntry.distanceKm;

    // Apply Riegel formula
    const distanceRatio = distanceKm / knownDistance;
    const riegelExponent = RIEGEL_FATIGUE_FACTOR - 1; // e.g., 1.15 - 1 = 0.15
    const degradationFactor = Math.pow(distanceRatio, riegelExponent);

    const predictedPace = knownPace * degradationFactor;

    console.log(`  → Riegel extrapolation: ${knownDistance}km @ ${knownPace.toFixed(2)}/km → ${distanceKm}km`);
    console.log(`    Formula: ${knownPace.toFixed(2)} × (${distanceKm}/${knownDistance})^${riegelExponent.toFixed(2)} = ${predictedPace.toFixed(2)}/km`);
    console.log(`    Degradation factor: ${degradationFactor.toFixed(3)}x (${((degradationFactor - 1) * 100).toFixed(1)}% slower)`);

    return { pace: predictedPace, isExtrapolated: true };
  }

  // Survival Factor: For races > 100km, add stoppage time (aid stations, sleep, etc.)
  // This is applied to total time at the end, not per-segment
  // TODO: Integrate survival factor into predictions for ultra-distance races
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function getSurvivalFactor(totalDistanceKm: number): number {
    if (totalDistanceKm <= 50) {
      return 1.0; // No significant stops for 50km and under
    } else if (totalDistanceKm <= 100) {
      return 1.05; // 5% for 50-100km (aid station time)
    } else if (totalDistanceKm <= 160) {
      return 1.10; // 10% for 100-milers
    } else {
      // For 200+ mile races, 15-20% for sleep/extended stops
      return 1.15 + (totalDistanceKm - 160) / 1000 * 0.05; // Gradually increases
    }
  }

  // Determine base pace: use plan override if set, otherwise use user's flat pace
  // Note: options.basePaceMinKm can be null (from database), so we need to handle that
  const basePace = (options.basePaceMinKm !== null && options.basePaceMinKm !== undefined)
    ? options.basePaceMinKm
    : perf.flatPaceMinKm;

  // Calculate total race distance: use race distance if set, otherwise derive from last aid station
  const lastStationDistance = raceData.aidStations.length > 0
    ? (raceData.aidStations[raceData.aidStations.length - 1].distanceKm ?? 0)
    : 0;
  const totalRaceDistanceKm = raceData.race.distanceKm ?? lastStationDistance ?? 100;

  console.log(`=== PREDICTION DEBUG ===`);
  console.log(`Race: ${raceData.race.name}`);
  console.log(`Total distance: ${totalRaceDistanceKm}km (race.distanceKm=${raceData.race.distanceKm}, lastStation=${lastStationDistance})`);
  console.log(`Base pace: ${basePace} min/km (from plan: ${options.basePaceMinKm}, from profile: ${perf.flatPaceMinKm})`);
  console.log(`Fatigue factor: ${perf.fatigueFactor} (has pace decay: ${!!perf.paceDecayByProgressPct})`);
  console.log(`Stations: ${raceData.aidStations.length}`);

  // Parse start time
  const startTime = options.startTime ?? new Date();
  startTime.setHours(
    raceData.race.startTime
      ? parseInt(raceData.race.startTime.split(':')[0], 10)
      : 6,
    raceData.race.startTime
      ? parseInt(raceData.race.startTime.split(':')[1], 10)
      : 0,
    0,
    0
  );

  // Build complete waypoint list with automatic Start and Finish
  // This ensures predictions always cover the full race distance
  interface Waypoint {
    id: string;
    name: string;
    distanceKm: number;
    distanceFromPrevKm: number | null;
    elevationGainFromPrevM: number | null;
    elevationLossFromPrevM: number | null;
    cutoffHoursFromStart: number | null;
    cutoffTime: string | null;
    isVirtual: boolean;
  }

  const waypoints: Waypoint[] = [];

  // Add Start waypoint if first station isn't at 0km
  const firstStationDistance = raceData.aidStations[0]?.distanceKm ?? 0;
  if (firstStationDistance > 0.1) {
    waypoints.push({
      id: 'start',
      name: 'Start',
      distanceKm: 0,
      distanceFromPrevKm: 0,
      elevationGainFromPrevM: null,
      elevationLossFromPrevM: null,
      cutoffHoursFromStart: null,
      cutoffTime: null,
      isVirtual: true,
    });
  }

  // Add all real aid stations
  for (const station of raceData.aidStations) {
    waypoints.push({
      ...station,
      distanceKm: station.distanceKm ?? 0,
      isVirtual: false,
    });
  }

  // Add Finish waypoint if last station isn't at the total distance
  const lastStationDistanceForFinish = raceData.aidStations[raceData.aidStations.length - 1]?.distanceKm ?? 0;
  if (totalRaceDistanceKm - lastStationDistanceForFinish > 0.1) {
    waypoints.push({
      id: 'finish',
      name: 'Finish',
      distanceKm: totalRaceDistanceKm,
      distanceFromPrevKm: totalRaceDistanceKm - lastStationDistanceForFinish,
      elevationGainFromPrevM: null,
      elevationLossFromPrevM: null,
      cutoffHoursFromStart: raceData.race.overallCutoffHours ?? null,
      cutoffTime: null,
      isVirtual: true,
    });
  }

  console.log(`Waypoints: ${waypoints.length} (${waypoints.filter(w => w.isVirtual).length} virtual)`);

  const predictions: AidStationPrediction[] = [];
  let cumulativeMinutes = 0;
  let prevDistanceKm = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const station = waypoints[i];
    const stationDistanceKm = station.distanceKm;
    const segmentDistance = station.distanceFromPrevKm ?? (stationDistanceKm - prevDistanceKm);

    // Calculate terrain factor based on elevation
    const elevGain = station.elevationGainFromPrevM ?? 0;
    const elevLoss = station.elevationLossFromPrevM ?? 0;
    let terrainFactor = 1.0;

    if (segmentDistance > 0) {
      // Calculate average gradient
      const netElevation = elevGain - elevLoss;
      const gradientPercent = (netElevation / (segmentDistance * 1000)) * 100;

      if (gradientPercent > 5) {
        // Steep climb - use climbing pace ratio
        terrainFactor = perf.climbingPaceMinKm / perf.flatPaceMinKm;
      } else if (gradientPercent > 2) {
        // Moderate climb
        terrainFactor = 1.0 + (gradientPercent - 2) * 0.1;
      } else if (gradientPercent < -5) {
        // Steep descent - use descending pace ratio
        terrainFactor = perf.descendingPaceMinKm / perf.flatPaceMinKm;
      } else if (gradientPercent < -2) {
        // Moderate descent
        terrainFactor = 0.9 + (Math.abs(gradientPercent) - 2) * 0.02;
      }
    }

    // Calculate fatigue factor based on distance covered
    // NEW: Use segment-based pace decay profile if available
    const distanceRatio = stationDistanceKm / totalRaceDistanceKm;
    const progressPct = distanceRatio * 100;

    let fatigueFactor = 1.0;
    if (perf.paceDecayByProgressPct && Object.keys(perf.paceDecayByProgressPct).length > 0) {
      // Find the appropriate bucket for current progress
      const bucketIdx = Math.min(Math.floor(progressPct / 10), 9);
      const bucketKey = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;

      if (perf.paceDecayByProgressPct[bucketKey]) {
        // The pace decay value is a multiplier relative to baseline (first 20%)
        // Values < 1.0 mean faster than baseline, > 1.0 means slower
        // For race predictions, we want fatigue to always be >= 1.0
        // So we normalize: if profile shows fast start, we use 1.0 at start
        // and scale up the relative differences for later buckets
        const rawMultiplier = perf.paceDecayByProgressPct[bucketKey];

        // Find the minimum multiplier in the profile (typically the "0-10" bucket)
        const allMultipliers = Object.values(perf.paceDecayByProgressPct);
        const minMultiplier = Math.min(...allMultipliers);

        // Normalize so minimum becomes 1.0, preserving relative differences
        // This way, the slowest relative to their start becomes the fatigue factor
        if (minMultiplier > 0 && minMultiplier < 1.0) {
          fatigueFactor = rawMultiplier / minMultiplier;
        } else {
          fatigueFactor = Math.max(1.0, rawMultiplier);
        }
      } else {
        // Fallback to linear interpolation if bucket not found
        fatigueFactor = 1.0 + (perf.fatigueFactor - 1.0) * distanceRatio;
      }
    } else {
      // Fallback: use linear Riegel-based fatigue estimate
      fatigueFactor = 1.0 + (perf.fatigueFactor - 1.0) * distanceRatio;
    }

    // Ensure fatigue factor is always >= 1.0 (you can't get faster from fatigue)
    fatigueFactor = Math.max(1.0, fatigueFactor);

    // NEW: Get base pace for this segment using distance-based lookup if available
    // This uses actual historical data: "At km 15, you typically run 12:30/km"
    let effectiveBasePace = basePace;
    const lookupResult = getPaceAtDistance(stationDistanceKm);
    if (lookupResult !== null) {
      // Use the distance-based pace (either from data or Riegel extrapolation)
      effectiveBasePace = lookupResult.pace;

      if (!lookupResult.isExtrapolated) {
        // For known data points, fatigue is already baked into the historical pace
        fatigueFactor = 1.0;
        console.log(`  → Using historical pace at ${stationDistanceKm}km: ${lookupResult.pace.toFixed(2)} min/km`);
      } else {
        // For extrapolated points, Riegel formula already accounts for fatigue
        fatigueFactor = 1.0;
      }
    }

    // Calculate nighttime factor
    const arrivalTime = new Date(startTime.getTime() + cumulativeMinutes * 60 * 1000);
    const hour = arrivalTime.getHours();
    const isNighttime = hour < 6 || hour >= 21;
    const nighttimeFactor = isNighttime ? 1.0 + options.nighttimeSlowdown : 1.0;

    // Calculate segment pace
    // If we have historical pace data, we only apply terrain and nighttime factors
    // If not, we apply terrain, fatigue, and nighttime factors
    let segmentPaceMinKm = effectiveBasePace * terrainFactor * fatigueFactor * nighttimeFactor;

    // SANITY CHECK: Cap pace at realistic human movement limits
    // Even extremely fatigued ultra runners don't go slower than power hiking
    const MAX_FLAT_PACE = 15.0;  // 15 min/km = slow walk/shuffle (4 km/h)
    const MAX_CLIMB_PACE = 25.0; // 25 min/km = steep hiking (2.4 km/h)
    const MAX_PACE = terrainFactor > 1.5 ? MAX_CLIMB_PACE : MAX_FLAT_PACE;

    if (segmentPaceMinKm > MAX_PACE) {
      console.log(`  ⚠️ Pace ${segmentPaceMinKm.toFixed(2)}/km exceeds max ${MAX_PACE}/km - capping`);
      segmentPaceMinKm = MAX_PACE;
    }

    // Debug logging for prediction factors
    console.log(`Station ${station.name}: distance=${stationDistanceKm}km, basePace=${basePace}, terrain=${terrainFactor.toFixed(3)}, fatigue=${fatigueFactor.toFixed(3)}, night=${nighttimeFactor.toFixed(3)}, finalPace=${segmentPaceMinKm.toFixed(2)}`);

    // Calculate segment time
    const segmentTimeMinutes = segmentDistance * segmentPaceMinKm;
    cumulativeMinutes += segmentTimeMinutes;

    // Calculate arrival time
    const predictedArrivalTime = new Date(startTime.getTime() + cumulativeMinutes * 60 * 1000);

    // Calculate cutoff status
    let cutoffTime: Date | undefined;
    let bufferMinutes: number | undefined;
    let status: 'safe' | 'warning' | 'danger' | 'missed' = 'safe';

    if (station.cutoffHoursFromStart) {
      cutoffTime = new Date(startTime.getTime() + station.cutoffHoursFromStart * 60 * 60 * 1000);
      bufferMinutes = (cutoffTime.getTime() - predictedArrivalTime.getTime()) / (60 * 1000);

      if (bufferMinutes < 0) {
        status = 'missed';
      } else if (bufferMinutes < 15) {
        status = 'danger';
      } else if (bufferMinutes < 30) {
        status = 'warning';
      }
    }

    predictions.push({
      aidStationId: station.id,
      aidStationName: station.name,
      distanceKm: stationDistanceKm,
      predictedArrivalMinutes: Math.round(cumulativeMinutes),
      predictedArrivalTime,
      cutoffHoursFromStart: station.cutoffHoursFromStart ?? undefined,
      cutoffTime,
      bufferMinutes: bufferMinutes !== undefined ? Math.round(bufferMinutes) : undefined,
      status,
      pacePredictions: {
        segmentPaceMinKm: Math.round(segmentPaceMinKm * 100) / 100,
        gradeAdjustedPaceMinKm: Math.round((segmentPaceMinKm / terrainFactor) * 100) / 100,
        terrainFactor: Math.round(terrainFactor * 100) / 100,
        fatigueFactor: Math.round(fatigueFactor * 100) / 100,
        nighttimeFactor: Math.round(nighttimeFactor * 100) / 100,
      },
    });

    // Add aid station stop time after each real (non-virtual) station
    // This accounts for refueling, gear changes, bathroom breaks, etc.
    if (!station.isVirtual && station.name !== 'Finish') {
      const stopMinutes = options.defaultAidStationMinutes ??
        getDefaultAidStationMinutes(
          totalRaceDistanceKm,
          (station as { hasDropBag?: boolean }).hasDropBag ?? false,
          (station as { hasCrew?: boolean }).hasCrew ?? false
        );

      cumulativeMinutes += stopMinutes;
      console.log(`  → Adding ${stopMinutes} min stop time at ${station.name}`);
    }

    prevDistanceKm = stationDistanceKm;
  }

  const predictedFinishTime = new Date(startTime.getTime() + cumulativeMinutes * 60 * 1000);

  return {
    aidStationPredictions: predictions,
    predictedTotalMinutes: Math.round(cumulativeMinutes),
    predictedFinishTime,
  };
}
