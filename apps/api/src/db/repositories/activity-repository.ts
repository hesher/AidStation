/**
 * Activity Repository
 *
 * Database operations for user activities and performance profiles.
 */

import { db } from '../connection';
import { userActivities, userPerformanceProfiles } from '../schema';
import { eq, desc, sql } from 'drizzle-orm';

type Activity = typeof userActivities.$inferSelect;
type PerformanceProfile = typeof userPerformanceProfiles.$inferSelect;

export interface CreateActivityData {
  userId: string;
  name?: string;
  activityDate?: string;
  gpxContent: string;
  distanceKm?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  movingTimeSeconds?: number;
  averagePaceMinKm?: number;
  gradeAdjustedPaceMinKm?: number;
  status?: string;
  analysisResults?: Record<string, unknown>;
}

export interface UpdateActivityData {
  name?: string;
  distanceKm?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  movingTimeSeconds?: number;
  totalTimeSeconds?: number;
  averagePaceMinKm?: number;
  gradeAdjustedPaceMinKm?: number;
  analysisResults?: Record<string, unknown>;
}

export interface GetActivitiesOptions {
  limit?: number;
  offset?: number;
}

/**
 * Create a new activity record
 */
export async function createActivity(data: CreateActivityData): Promise<Activity> {
  const activityDate = data.activityDate ? new Date(data.activityDate) : undefined;

  const [activity] = await db
    .insert(userActivities)
    .values({
      userId: data.userId,
      name: data.name,
      activityDate,
      gpxContent: data.gpxContent,
      distanceKm: data.distanceKm,
      elevationGainM: data.elevationGainM,
      elevationLossM: data.elevationLossM,
      movingTimeSeconds: data.movingTimeSeconds,
      averagePaceMinKm: data.averagePaceMinKm,
      gradeAdjustedPaceMinKm: data.gradeAdjustedPaceMinKm,
      analysisResults: data.analysisResults,
    })
    .returning();

  return activity;
}

/**
 * Get all activities for a user with pagination
 */
export async function getActivitiesByUser(
  userId: string,
  options: GetActivitiesOptions = {}
): Promise<{ activities: Activity[]; total: number }> {
  const { limit = 20, offset = 0 } = options;

  const activities = await db
    .select()
    .from(userActivities)
    .where(eq(userActivities.userId, userId))
    .orderBy(desc(userActivities.activityDate), desc(userActivities.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(userActivities)
    .where(eq(userActivities.userId, userId));

  return { activities, total: count };
}

/**
 * Get a single activity by ID
 */
export async function getActivityById(id: string): Promise<Activity | null> {
  const [activity] = await db
    .select()
    .from(userActivities)
    .where(eq(userActivities.id, id));

  return activity || null;
}

/**
 * Update an activity
 */
export async function updateActivity(
  id: string,
  data: UpdateActivityData
): Promise<Activity | null> {
  const [activity] = await db
    .update(userActivities)
    .set(data)
    .where(eq(userActivities.id, id))
    .returning();

  return activity || null;
}

/**
 * Delete an activity
 */
export async function deleteActivity(id: string): Promise<boolean> {
  const result = await db
    .delete(userActivities)
    .where(eq(userActivities.id, id))
    .returning({ id: userActivities.id });

  return result.length > 0;
}

/**
 * Get user's performance profile
 */
export async function getUserPerformanceProfile(
  userId: string
): Promise<PerformanceProfile | null> {
  const [profile] = await db
    .select()
    .from(userPerformanceProfiles)
    .where(eq(userPerformanceProfiles.userId, userId));

  return profile || null;
}

/**
 * Create or update user's performance profile
 */
export async function updateUserPerformanceProfile(
  userId: string,
  data: {
    flatPaceMinKm?: number;
    climbingPaceMinKm?: number;
    descendingPaceMinKm?: number;
    fatigueFactor?: number;
    recencyHalfLifeDays?: number;
    profileData?: Record<string, unknown>;
  }
): Promise<PerformanceProfile> {
  const [profile] = await db
    .insert(userPerformanceProfiles)
    .values({
      userId,
      ...data,
      lastCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPerformanceProfiles.userId,
      set: {
        ...data,
        lastCalculatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return profile;
}

/**
 * Calculate weighted performance based on recency
 * Uses exponential decay: weight = e^(-days_ago / half_life)
 */
export function calculateRecencyWeight(
  activityDate: Date,
  halfLifeDays: number = 90
): number {
  const now = new Date();
  const daysAgo = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysAgo / halfLifeDays);
}

/**
 * Get weighted activities for performance calculation
 */
export async function getWeightedActivitiesForUser(
  userId: string,
  halfLifeDays: number = 90
): Promise<Array<Activity & { recencyWeight: number }>> {
  const { activities } = await getActivitiesByUser(userId, { limit: 1000 });

  return activities
    .filter((a) => a.activityDate !== null)
    .map((activity) => ({
      ...activity,
      recencyWeight: calculateRecencyWeight(activity.activityDate!, halfLifeDays),
    }))
    .sort((a, b) => b.recencyWeight - a.recencyWeight);
}
