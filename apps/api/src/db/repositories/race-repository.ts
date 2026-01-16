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
      location: raceData.location ?? null,
      country: raceData.country ?? null,
      distanceKm: raceData.distanceKm ?? null,
      elevationGainM: raceData.elevationGainM ?? null,
      elevationLossM: raceData.elevationLossM ?? null,
      startTime: raceData.startTime ?? null,
      overallCutoffHours: raceData.overallCutoffHours ?? null,
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
  raceData: Partial<RaceData>,
  aidStationList?: AidStationData[]
): Promise<RaceWithAidStations | null> {
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

  if (!updatedRace) {
    return null;
  }

  // Update aid stations if provided
  let updatedAidStations: typeof aidStations.$inferSelect[] = [];
  if (aidStationList !== undefined) {
    // Delete existing aid stations for this race
    await db.delete(aidStations).where(eq(aidStations.raceId, id));

    // Insert new aid stations if provided
    if (aidStationList.length > 0) {
      updatedAidStations = await db
        .insert(aidStations)
        .values(
          aidStationList.map((station, index) => ({
            raceId: id,
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
  } else {
    // Aid stations not provided, fetch existing ones
    updatedAidStations = await db
      .select()
      .from(aidStations)
      .where(eq(aidStations.raceId, id))
      .orderBy(aidStations.sortOrder);
  }

  return {
    ...updatedRace,
    aidStations: updatedAidStations,
  };
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

/**
 * Search races with visibility filtering
 * Returns public races and user's own private races
 */
export async function searchRaces(
  options: {
    userId?: string;
    search?: string;
    country?: string;
    includePublic?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ races: typeof races.$inferSelect[]; total: number }> {
  const {
    userId,
    search,
    country,
    includePublic = true,
    limit = 20,
    offset = 0,
  } = options;

  // Build conditions
  const conditions: ReturnType<typeof eq>[] = [];

  // Visibility filter: public races OR user's own races
  // This is handled in the query logic below

  // Country filter
  if (country) {
    conditions.push(eq(races.country, country));
  }

  // Execute query with visibility logic
  // Note: For complex OR conditions with Drizzle, we need to use raw SQL or multiple queries
  // For simplicity, we'll fetch and filter, which is acceptable for reasonable dataset sizes
  const allRaces = await db
    .select()
    .from(races)
    .orderBy(desc(races.createdAt))
    .limit(limit + 100); // Fetch extra for filtering

  // Apply visibility filter
  let filteredRaces = allRaces.filter((race) => {
    // Include if public and includePublic is true
    if (includePublic && race.isPublic) {
      return true;
    }
    // Include if owned by the user
    if (userId && race.ownerId === userId) {
      return true;
    }
    return false;
  });

  // Apply country filter
  if (country) {
    filteredRaces = filteredRaces.filter(
      (race) => race.country?.toLowerCase() === country.toLowerCase()
    );
  }

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filteredRaces = filteredRaces.filter(
      (race) =>
        race.name.toLowerCase().includes(searchLower) ||
        race.location?.toLowerCase().includes(searchLower)
    );
  }

  const total = filteredRaces.length;

  // Apply pagination
  const paginatedRaces = filteredRaces.slice(offset, offset + limit);

  return {
    races: paginatedRaces,
    total,
  };
}

/**
 * Get all unique countries from races (for filter dropdown)
 */
export async function getUniqueCountries(): Promise<string[]> {
  const results = await db
    .select({ country: races.country })
    .from(races)
    .where(eq(races.isPublic, true));

  const countries = new Set<string>();
  for (const row of results) {
    if (row.country) {
      countries.add(row.country);
    }
  }

  return Array.from(countries).sort();
}
