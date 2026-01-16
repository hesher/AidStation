/**
 * Race Repository
 *
 * Handles database operations for races and aid stations.
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '../connection';
import { races, aidStations } from '../schema';
import type { RaceData, AidStationData, RaceWithAidStations } from './types';

/**
 * Create a new race with aid stations
 */
export async function createRace(
  raceData: RaceData,
  aidStationList?: AidStationData[]
): Promise<RaceWithAidStations> {
  // Insert race
  const [insertedRace] = await db
    .insert(races)
    .values({
      name: raceData.name,
      date: raceData.date ? new Date(raceData.date) : null,
      location: raceData.location,
      country: raceData.country,
      distanceKm: raceData.distanceKm,
      elevationGainM: raceData.elevationGainM,
      elevationLossM: raceData.elevationLossM,
      startTime: raceData.startTime,
      overallCutoffHours: raceData.overallCutoffHours,
      courseGpx: raceData.courseGpx,
      isPublic: raceData.isPublic ?? false,
      ownerId: raceData.ownerId,
      metadata: raceData.metadata,
    })
    .returning();

  // Insert aid stations if provided
  let insertedAidStations: typeof aidStations.$inferSelect[] = [];
  if (aidStationList && aidStationList.length > 0) {
    insertedAidStations = await db
      .insert(aidStations)
      .values(
        aidStationList.map((station, index) => ({
          raceId: insertedRace.id,
          name: station.name,
          distanceKm: station.distanceKm,
          distanceFromPrevKm: station.distanceFromPrevKm,
          elevationM: station.elevationM,
          elevationGainFromPrevM: station.elevationGainFromPrevM,
          elevationLossFromPrevM: station.elevationLossFromPrevM,
          hasDropBag: station.hasDropBag ?? false,
          hasCrew: station.hasCrew ?? false,
          hasPacer: station.hasPacer ?? false,
          cutoffTime: station.cutoffTime,
          cutoffHoursFromStart: station.cutoffHoursFromStart,
          sortOrder: index,
          latitude: station.latitude,
          longitude: station.longitude,
        }))
      )
      .returning();
  }

  return {
    ...insertedRace,
    aidStations: insertedAidStations,
  };
}

/**
 * Get a race by ID with its aid stations
 */
export async function getRaceById(id: string): Promise<RaceWithAidStations | null> {
  const [race] = await db.select().from(races).where(eq(races.id, id));

  if (!race) {
    return null;
  }

  const raceAidStations = await db
    .select()
    .from(aidStations)
    .where(eq(aidStations.raceId, id))
    .orderBy(aidStations.sortOrder);

  return {
    ...race,
    aidStations: raceAidStations,
  };
}

/**
 * Update a race
 */
export async function updateRace(
  id: string,
  raceData: Partial<RaceData>
): Promise<typeof races.$inferSelect | null> {
  const [updatedRace] = await db
    .update(races)
    .set({
      name: raceData.name,
      date: raceData.date ? new Date(raceData.date) : undefined,
      location: raceData.location,
      country: raceData.country,
      distanceKm: raceData.distanceKm,
      elevationGainM: raceData.elevationGainM,
      elevationLossM: raceData.elevationLossM,
      startTime: raceData.startTime,
      overallCutoffHours: raceData.overallCutoffHours,
      courseGpx: raceData.courseGpx,
      isPublic: raceData.isPublic,
      metadata: raceData.metadata,
    })
    .where(eq(races.id, id))
    .returning();

  return updatedRace || null;
}

/**
 * Delete a race and its aid stations (cascade delete handled by DB)
 */
export async function deleteRace(id: string): Promise<boolean> {
  const result = await db.delete(races).where(eq(races.id, id)).returning();
  return result.length > 0;
}

/**
 * Get recent races (for listing)
 */
export async function getRecentRaces(limit = 10): Promise<typeof races.$inferSelect[]> {
  return db.select().from(races).orderBy(desc(races.createdAt)).limit(limit);
}

/**
 * Get races by owner
 */
export async function getRacesByOwner(
  ownerId: string
): Promise<typeof races.$inferSelect[]> {
  return db
    .select()
    .from(races)
    .where(eq(races.ownerId, ownerId))
    .orderBy(desc(races.createdAt));
}
