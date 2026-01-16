/**
 * Plans Routes
 *
 * API routes for race plan management and prediction generation.
 */

import { FastifyInstance } from 'fastify';
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
  AidStationPrediction,
} from '../db/repositories';

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

// Helper to get userId from cookie (simplified - in production use proper auth)
function getUserId(request: { cookies?: { userId?: string } }): string {
  const userId = request.cookies?.userId;
  if (!userId) {
    throw new Error('User not authenticated');
  }
  return userId;
}

export async function planRoutes(app: FastifyInstance) {
  /**
   * Create a new race plan
   * POST /api/plans
   */
  app.post('/plans', async (request, reply) => {
    try {
      const userId = getUserId(request);
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
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Create plan error:', error);
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
      const userId = getUserId(request);
      const query = request.query as { limit?: string; offset?: string };

      const { plans, total } = await getPlansByUser(userId, {
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });

      return reply.send({
        success: true,
        data: { plans, total },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Get plans error:', error);
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
      const { id } = request.params as { id: string };
      const plan = await getPlanById(id);

      if (!plan) {
        return reply.status(404).send({
          success: false,
          error: 'Plan not found',
        });
      }

      // Verify ownership
      const userId = getUserId(request);
      if (plan.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      return reply.send({
        success: true,
        data: plan,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Get plan error:', error);
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
      const userId = getUserId(request);
      const { raceId } = request.params as { raceId: string };

      const plans = await getPlansByRace(userId, raceId);

      return reply.send({
        success: true,
        data: { plans },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Get plans by race error:', error);
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
      const userId = getUserId(request);
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
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Update plan error:', error);
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
      const userId = getUserId(request);
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

      return reply.send({
        success: true,
        message: 'Plan deleted',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Delete plan error:', error);
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
      const userId = getUserId(request);
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
      const performance = await getUserPerformanceForPrediction(userId);

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

      return reply.send({
        success: true,
        data: updatedPlan,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Generate predictions error:', error);
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
      const userId = getUserId(request);
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

      return reply.send({
        success: true,
        message: 'Plan activated',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      console.error('Activate plan error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to activate plan',
      });
    }
  });
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
      distanceKm: number;
      distanceFromPrevKm: number | null;
      elevationGainFromPrevM: number | null;
      elevationLossFromPrevM: number | null;
      cutoffHoursFromStart: number | null;
      cutoffTime: string | null;
    }>;
  },
  performance: {
    flatPaceMinKm: number;
    climbingPaceMinKm: number;
    descendingPaceMinKm: number;
    fatigueFactor: number;
  } | null,
  options: {
    basePaceMinKm?: number | null;
    nighttimeSlowdown: number;
    startTime?: Date | null;
  }
): {
  aidStationPredictions: AidStationPrediction[];
  predictedTotalMinutes: number;
  predictedFinishTime: Date;
} {
  // Use default performance if none available
  const perf = performance ?? {
    flatPaceMinKm: 6.5,
    climbingPaceMinKm: 12.0,
    descendingPaceMinKm: 5.5,
    fatigueFactor: 1.08,
  };

  // Determine base pace
  const basePace = options.basePaceMinKm ?? perf.flatPaceMinKm;

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

  const predictions: AidStationPrediction[] = [];
  let cumulativeMinutes = 0;
  let prevDistanceKm = 0;

  for (let i = 0; i < raceData.aidStations.length; i++) {
    const station = raceData.aidStations[i];
    const segmentDistance = station.distanceFromPrevKm ?? (station.distanceKm - prevDistanceKm);

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
    const distanceRatio = station.distanceKm / (raceData.race.distanceKm ?? 100);
    const fatigueFactor = 1.0 + (perf.fatigueFactor - 1.0) * distanceRatio;

    // Calculate nighttime factor
    const arrivalTime = new Date(startTime.getTime() + cumulativeMinutes * 60 * 1000);
    const hour = arrivalTime.getHours();
    const isNighttime = hour < 6 || hour >= 21;
    const nighttimeFactor = isNighttime ? 1.0 + options.nighttimeSlowdown : 1.0;

    // Calculate segment pace
    const segmentPaceMinKm = basePace * terrainFactor * fatigueFactor * nighttimeFactor;

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
      distanceKm: station.distanceKm,
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

    prevDistanceKm = station.distanceKm;
  }

  const predictedFinishTime = new Date(startTime.getTime() + cumulativeMinutes * 60 * 1000);

  return {
    aidStationPredictions: predictions,
    predictedTotalMinutes: Math.round(cumulativeMinutes),
    predictedFinishTime,
  };
}
