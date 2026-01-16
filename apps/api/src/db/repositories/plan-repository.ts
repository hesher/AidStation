/**
 * Race Plan Repository
 *
 * Manages race plans with predictions for aid station arrival times.
 */

import { db } from '../connection';
import { racePlans, races, aidStations, userPerformanceProfiles } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

// Types for race plans
export interface CreatePlanData {
  userId: string;
  raceId: string;
  name?: string;
  basePaceMinKm?: number;
  nighttimeSlowdown?: number;
  startTime?: Date;
}

export interface AidStationPrediction {
  aidStationId: string;
  aidStationName: string;
  distanceKm: number;
  predictedArrivalMinutes: number;
  predictedArrivalTime: Date;
  cutoffHoursFromStart?: number;
  cutoffTime?: Date;
  bufferMinutes?: number;
  status: 'safe' | 'warning' | 'danger' | 'missed';
  pacePredictions: {
    segmentPaceMinKm: number;
    gradeAdjustedPaceMinKm: number;
    terrainFactor: number;
    fatigueFactor: number;
    nighttimeFactor: number;
  };
}

export interface RacePlan {
  id: string;
  userId: string;
  raceId: string;
  name: string | null;
  basePaceMinKm: number | null;
  nighttimeSlowdown: number | null;
  startTime: Date | null;
  predictedFinishTime: Date | null;
  predictedTotalMinutes: number | null;
  aidStationPredictions: AidStationPrediction[] | null;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RacePlanWithRace extends RacePlan {
  race: {
    id: string;
    name: string;
    distanceKm: number | null;
    elevationGainM: number | null;
    startTime: string | null;
  };
}

/**
 * Create a new race plan
 */
export async function createPlan(data: CreatePlanData): Promise<RacePlan> {
  const [plan] = await db
    .insert(racePlans)
    .values({
      userId: data.userId,
      raceId: data.raceId,
      name: data.name,
      basePaceMinKm: data.basePaceMinKm,
      nighttimeSlowdown: data.nighttimeSlowdown ?? 0.15,
      startTime: data.startTime,
      isActive: true,
    })
    .returning();

  return plan as RacePlan;
}

/**
 * Get a plan by ID
 */
export async function getPlanById(planId: string): Promise<RacePlan | null> {
  const [plan] = await db
    .select()
    .from(racePlans)
    .where(eq(racePlans.id, planId))
    .limit(1);

  return plan ? (plan as RacePlan) : null;
}

/**
 * Get all plans for a user
 */
export async function getPlansByUser(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ plans: RacePlanWithRace[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const results = await db
    .select({
      plan: racePlans,
      race: {
        id: races.id,
        name: races.name,
        distanceKm: races.distanceKm,
        elevationGainM: races.elevationGainM,
        startTime: races.startTime,
      },
    })
    .from(racePlans)
    .innerJoin(races, eq(racePlans.raceId, races.id))
    .where(eq(racePlans.userId, userId))
    .orderBy(desc(racePlans.updatedAt))
    .limit(limit)
    .offset(offset);

  const plans: RacePlanWithRace[] = results.map((row) => ({
    ...(row.plan as RacePlan),
    race: row.race,
  }));

  // Get total count
  const allPlans = await db
    .select({ id: racePlans.id })
    .from(racePlans)
    .where(eq(racePlans.userId, userId));

  return { plans, total: allPlans.length };
}

/**
 * Get plans for a specific race
 */
export async function getPlansByRace(
  userId: string,
  raceId: string
): Promise<RacePlan[]> {
  const results = await db
    .select()
    .from(racePlans)
    .where(and(eq(racePlans.userId, userId), eq(racePlans.raceId, raceId)))
    .orderBy(desc(racePlans.updatedAt));

  return results as RacePlan[];
}

/**
 * Update a plan with predictions
 */
export async function updatePlanPredictions(
  planId: string,
  predictions: {
    aidStationPredictions: AidStationPrediction[];
    predictedTotalMinutes: number;
    predictedFinishTime: Date;
  }
): Promise<RacePlan | null> {
  const [updated] = await db
    .update(racePlans)
    .set({
      aidStationPredictions: predictions.aidStationPredictions,
      predictedTotalMinutes: predictions.predictedTotalMinutes,
      predictedFinishTime: predictions.predictedFinishTime,
      updatedAt: new Date(),
    })
    .where(eq(racePlans.id, planId))
    .returning();

  return updated ? (updated as RacePlan) : null;
}

/**
 * Update plan settings
 */
export async function updatePlan(
  planId: string,
  data: Partial<CreatePlanData>
): Promise<RacePlan | null> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.basePaceMinKm !== undefined)
    updateData.basePaceMinKm = data.basePaceMinKm;
  if (data.nighttimeSlowdown !== undefined)
    updateData.nighttimeSlowdown = data.nighttimeSlowdown;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;

  const [updated] = await db
    .update(racePlans)
    .set(updateData)
    .where(eq(racePlans.id, planId))
    .returning();

  return updated ? (updated as RacePlan) : null;
}

/**
 * Delete a plan
 */
export async function deletePlan(planId: string): Promise<boolean> {
  const result = await db
    .delete(racePlans)
    .where(eq(racePlans.id, planId))
    .returning({ id: racePlans.id });

  return result.length > 0;
}

/**
 * Get race data needed for prediction
 */
export async function getRaceForPrediction(raceId: string): Promise<{
  race: {
    id: string;
    name: string;
    distanceKm: number | null;
    elevationGainM: number | null;
    elevationLossM: number | null;
    startTime: string | null;
    overallCutoffHours: number | null;
  };
  aidStations: Array<{
    id: string;
    name: string;
    distanceKm: number | null;
    distanceFromPrevKm: number | null;
    elevationM: number | null;
    elevationGainFromPrevM: number | null;
    elevationLossFromPrevM: number | null;
    cutoffHoursFromStart: number | null;
    cutoffTime: string | null;
    sortOrder: number;
  }>;
} | null> {
  const [race] = await db
    .select()
    .from(races)
    .where(eq(races.id, raceId))
    .limit(1);

  if (!race) return null;

  const stations = await db
    .select()
    .from(aidStations)
    .where(eq(aidStations.raceId, raceId))
    .orderBy(aidStations.sortOrder);

  return {
    race: {
      id: race.id,
      name: race.name,
      distanceKm: race.distanceKm,
      elevationGainM: race.elevationGainM,
      elevationLossM: race.elevationLossM,
      startTime: race.startTime,
      overallCutoffHours: race.overallCutoffHours,
    },
    aidStations: stations.map((s) => ({
      id: s.id,
      name: s.name,
      distanceKm: s.distanceKm,
      distanceFromPrevKm: s.distanceFromPrevKm,
      elevationM: s.elevationM,
      elevationGainFromPrevM: s.elevationGainFromPrevM,
      elevationLossFromPrevM: s.elevationLossFromPrevM,
      cutoffHoursFromStart: s.cutoffHoursFromStart,
      cutoffTime: s.cutoffTime,
      sortOrder: s.sortOrder,
    })),
  };
}

/**
 * Get user's performance profile for predictions
 */
export async function getUserPerformanceForPrediction(userId: string): Promise<{
  flatPaceMinKm: number;
  climbingPaceMinKm: number;
  descendingPaceMinKm: number;
  fatigueFactor: number;
  profileData: Record<string, unknown> | null;
} | null> {
  const [profile] = await db
    .select()
    .from(userPerformanceProfiles)
    .where(eq(userPerformanceProfiles.userId, userId))
    .limit(1);

  if (!profile) return null;

  return {
    flatPaceMinKm: profile.flatPaceMinKm ?? 6.0, // Default ~6 min/km
    climbingPaceMinKm: profile.climbingPaceMinKm ?? 10.0, // Default ~10 min/km
    descendingPaceMinKm: profile.descendingPaceMinKm ?? 5.0, // Default ~5 min/km
    fatigueFactor: profile.fatigueFactor ?? 1.06, // Default 6% slowdown
    profileData: profile.profileData as Record<string, unknown> | null,
  };
}

/**
 * Set a plan as active (deactivate others for same user/race)
 */
export async function setActivePlan(
  planId: string,
  userId: string,
  raceId: string
): Promise<void> {
  // Deactivate other plans for this user/race combo
  await db
    .update(racePlans)
    .set({ isActive: false })
    .where(and(eq(racePlans.userId, userId), eq(racePlans.raceId, raceId)));

  // Activate the selected plan
  await db
    .update(racePlans)
    .set({ isActive: true })
    .where(eq(racePlans.id, planId));
}
