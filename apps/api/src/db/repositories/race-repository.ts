/**
 * Race Repository
 *
 * Handles database operations for races and aid stations.
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../connection';
import { races, aidStations } from '../schema';
import type { RaceData, AidStationData, RaceWithAidStations } from './types';

/**
 * Parse GPX content and extract coordinates as a LineString WKT
 * Returns null if GPX parsing fails or no track points found
 */
function gpxToLineStringWKT(gpxContent: string): string | null {
  try {
    const coordinates: Array<[number, number]> = [];

    // Match all trkpt elements with lat/lon attributes
    const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>/g;
    let match;

    while ((match = trkptRegex.exec(gpxContent)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push([lon, lat]); // PostGIS uses lon/lat order
      }
    }

    // If no track points, try route points
    if (coordinates.length === 0) {
      const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>/g;
      while ((match = rteptRegex.exec(gpxContent)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push([lon, lat]);
        }
      }
    }

    if (coordinates.length < 2) {
      return null; // Need at least 2 points for a LineString
    }

    // Build WKT LineString
    const coordStr = coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
    return `LINESTRING(${coordStr})`;
  } catch {
    return null;
  }
}

/**
 * Update the course_geometry column if PostGIS is available
 * Fails silently if PostGIS is not installed
 */
async function updateCourseGeometry(raceId: string, gpxContent: string): Promise<void> {
  try {
    const wkt = gpxToLineStringWKT(gpxContent);
    if (!wkt) {
      return; // No valid geometry to store
    }

    // Use raw SQL to update the geometry column
    // This will fail silently if PostGIS is not installed or column doesn't exist
    await db.execute(
      sql`UPDATE races SET course_geometry = ST_GeomFromText(${wkt}, 4326) WHERE id = ${raceId}::uuid`
    );
  } catch {
    // PostGIS not available or geometry column doesn't exist - fail silently
    // The app will continue to work without geometry data
  }
}

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

  // Update PostGIS geometry if GPX content was provided
  if (raceData.courseGpx) {
    await updateCourseGeometry(insertedRace.id, raceData.courseGpx);
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

  // Update PostGIS geometry if GPX content was updated
  if (raceData.courseGpx) {
    await updateCourseGeometry(id, raceData.courseGpx);
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

/**
 * Race version type for version history queries
 */
export interface RaceVersion {
  id: string;
  raceId: string;
  versionNumber: number;
  name: string;
  date: Date | null;
  location: string | null;
  country: string | null;
  distanceKm: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  startTime: string | null;
  overallCutoffHours: number | null;
  courseGpx: string | null;
  isPublic: boolean | null;
  metadata: Record<string, unknown> | null;
  aidStationsSnapshot: AidStationData[] | null;
  changeSummary: string | null;
  changedBy: string | null;
  createdAt: Date;
}

/**
 * Get version history for a race
 * Returns all previous versions in descending order (newest first)
 */
export async function getRaceVersionHistory(
  raceId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ versions: RaceVersion[]; total: number }> {
  const { limit = 20, offset = 0 } = options ?? {};

  try {
    // Query version count
    const countResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM race_versions WHERE race_id = ${raceId}::uuid`
    );
    const total = parseInt((countResult.rows[0] as { count: string })?.count ?? '0', 10);

    // Query versions
    const result = await db.execute(sql`
      SELECT 
        id,
        race_id,
        version_number,
        name,
        date,
        location,
        country,
        distance_km,
        elevation_gain_m,
        elevation_loss_m,
        start_time,
        overall_cutoff_hours,
        course_gpx,
        is_public,
        metadata,
        aid_stations_snapshot,
        change_summary,
        changed_by,
        created_at
      FROM race_versions
      WHERE race_id = ${raceId}::uuid
      ORDER BY version_number DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const versions: RaceVersion[] = (result.rows as Array<{
      id: string;
      race_id: string;
      version_number: number;
      name: string;
      date: string | null;
      location: string | null;
      country: string | null;
      distance_km: number | null;
      elevation_gain_m: number | null;
      elevation_loss_m: number | null;
      start_time: string | null;
      overall_cutoff_hours: number | null;
      course_gpx: string | null;
      is_public: boolean | null;
      metadata: Record<string, unknown> | null;
      aid_stations_snapshot: AidStationData[] | null;
      change_summary: string | null;
      changed_by: string | null;
      created_at: string;
    }>).map(row => ({
      id: row.id,
      raceId: row.race_id,
      versionNumber: row.version_number,
      name: row.name,
      date: row.date ? new Date(row.date) : null,
      location: row.location,
      country: row.country,
      distanceKm: row.distance_km,
      elevationGainM: row.elevation_gain_m,
      elevationLossM: row.elevation_loss_m,
      startTime: row.start_time,
      overallCutoffHours: row.overall_cutoff_hours,
      courseGpx: row.course_gpx,
      isPublic: row.is_public,
      metadata: row.metadata,
      aidStationsSnapshot: row.aid_stations_snapshot,
      changeSummary: row.change_summary,
      changedBy: row.changed_by,
      createdAt: new Date(row.created_at),
    }));

    return { versions, total };
  } catch {
    // Table might not exist yet (migration not run)
    return { versions: [], total: 0 };
  }
}

/**
 * Get a specific version of a race
 */
export async function getRaceVersion(
  raceId: string,
  versionNumber: number
): Promise<RaceVersion | null> {
  try {
    const result = await db.execute(sql`
      SELECT 
        id,
        race_id,
        version_number,
        name,
        date,
        location,
        country,
        distance_km,
        elevation_gain_m,
        elevation_loss_m,
        start_time,
        overall_cutoff_hours,
        course_gpx,
        is_public,
        metadata,
        aid_stations_snapshot,
        change_summary,
        changed_by,
        created_at
      FROM race_versions
      WHERE race_id = ${raceId}::uuid AND version_number = ${versionNumber}
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      id: string;
      race_id: string;
      version_number: number;
      name: string;
      date: string | null;
      location: string | null;
      country: string | null;
      distance_km: number | null;
      elevation_gain_m: number | null;
      elevation_loss_m: number | null;
      start_time: string | null;
      overall_cutoff_hours: number | null;
      course_gpx: string | null;
      is_public: boolean | null;
      metadata: Record<string, unknown> | null;
      aid_stations_snapshot: AidStationData[] | null;
      change_summary: string | null;
      changed_by: string | null;
      created_at: string;
    };

    return {
      id: row.id,
      raceId: row.race_id,
      versionNumber: row.version_number,
      name: row.name,
      date: row.date ? new Date(row.date) : null,
      location: row.location,
      country: row.country,
      distanceKm: row.distance_km,
      elevationGainM: row.elevation_gain_m,
      elevationLossM: row.elevation_loss_m,
      startTime: row.start_time,
      overallCutoffHours: row.overall_cutoff_hours,
      courseGpx: row.course_gpx,
      isPublic: row.is_public,
      metadata: row.metadata,
      aidStationsSnapshot: row.aid_stations_snapshot,
      changeSummary: row.change_summary,
      changedBy: row.changed_by,
      createdAt: new Date(row.created_at),
    };
  } catch {
    // Table might not exist yet
    return null;
  }
}

/**
 * Restore a race to a specific version
 * This creates a new version (with the current state) and then restores
 */
export async function restoreRaceVersion(
  raceId: string,
  versionNumber: number
): Promise<RaceWithAidStations | null> {
  const version = await getRaceVersion(raceId, versionNumber);
  if (!version) {
    return null;
  }

  // Update the race with the version data
  const updatedRace = await updateRace(
    raceId,
    {
      name: version.name,
      date: version.date?.toISOString() ?? null,
      location: version.location ?? undefined,
      country: version.country ?? undefined,
      distanceKm: version.distanceKm ?? undefined,
      elevationGainM: version.elevationGainM ?? undefined,
      elevationLossM: version.elevationLossM ?? undefined,
      startTime: version.startTime ?? undefined,
      overallCutoffHours: version.overallCutoffHours ?? undefined,
      courseGpx: version.courseGpx ?? undefined,
      isPublic: version.isPublic ?? undefined,
      metadata: version.metadata ?? undefined,
    },
    version.aidStationsSnapshot ?? undefined
  );

  return updatedRace;
}
