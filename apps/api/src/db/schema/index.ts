import { pgTable, text, timestamp, boolean, integer, real, jsonb, uuid } from 'drizzle-orm/pg-core';

// Custom PostGIS geometry type (for future use when PostGIS is enabled)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _geometry = (name: string, _srid = 4326) => {
  // This will be used when PostGIS is available
  // return sql<string>`geometry(Geometry, ${srid})`.as(name);
  return name;
};

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Races table with PostGIS geometry for course
export const races = pgTable('races', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  date: timestamp('date'),
  location: text('location'),
  country: text('country'),
  distanceKm: real('distance_km'),
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
  startTime: text('start_time'),
  overallCutoffHours: real('overall_cutoff_hours'),
  courseGpx: text('course_gpx'), // Raw GPX content
  // courseGeometry will be added via raw SQL migration for PostGIS
  isPublic: boolean('is_public').default(false).notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  versionNumber: integer('version_number').default(1).notNull(), // Current version number
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  metadata: jsonb('metadata'), // Additional race info from AI
});

// Race versions table for version history
export const raceVersions = pgTable('race_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  raceId: uuid('race_id').references(() => races.id).notNull(),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  date: timestamp('date'),
  location: text('location'),
  country: text('country'),
  distanceKm: real('distance_km'),
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
  startTime: text('start_time'),
  overallCutoffHours: real('overall_cutoff_hours'),
  courseGpx: text('course_gpx'),
  isPublic: boolean('is_public'),
  metadata: jsonb('metadata'),
  aidStationsSnapshot: jsonb('aid_stations_snapshot'), // JSON array of aid stations
  changeSummary: text('change_summary'),
  changedBy: uuid('changed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Aid stations / waypoints table
export const aidStations = pgTable('aid_stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  raceId: uuid('race_id').references(() => races.id).notNull(),
  name: text('name').notNull(),
  distanceKm: real('distance_km'),
  distanceFromPrevKm: real('distance_from_prev_km'),
  elevationM: real('elevation_m'),
  elevationGainFromPrevM: real('elevation_gain_from_prev_m'),
  elevationLossFromPrevM: real('elevation_loss_from_prev_m'),
  hasDropBag: boolean('has_drop_bag').default(false),
  hasCrew: boolean('has_crew').default(false),
  hasPacer: boolean('has_pacer').default(false),
  cutoffTime: text('cutoff_time'), // ISO time or duration
  cutoffHoursFromStart: real('cutoff_hours_from_start'),
  sortOrder: integer('sort_order').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  terrainType: text('terrain_type').default('trail'), // road, gravel, single_track, technical, alpine, etc.
  waypointType: text('waypoint_type').default('aid_station'), // aid_station, water_stop, view_point, toilet, milestone, peak, checkpoint, custom
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Waypoint types lookup table
export const waypointTypes = pgTable('waypoint_types', {
  typeId: text('type_id').primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  icon: text('icon'),
  color: text('color'),
});

// Terrain factors lookup table
export const terrainFactors = pgTable('terrain_factors', {
  terrainType: text('terrain_type').primaryKey(),
  paceFactor: real('pace_factor').notNull(),
  description: text('description'),
  icon: text('icon'),
});

// User activities (GPX uploads for performance analysis)
export const userActivities = pgTable('user_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name'),
  activityDate: timestamp('activity_date'),
  distanceKm: real('distance_km'),
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
  movingTimeSeconds: integer('moving_time_seconds'),
  totalTimeSeconds: integer('total_time_seconds'),
  averagePaceMinKm: real('average_pace_min_km'),
  gradeAdjustedPaceMinKm: real('grade_adjusted_pace_min_km'),
  gpxContent: text('gpx_content'),
  // activityGeometry will be added via raw SQL migration for PostGIS
  analysisResults: jsonb('analysis_results'), // Detailed analysis from Python worker
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// User performance profile (aggregated from activities)
export const userPerformanceProfiles = pgTable('user_performance_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  flatPaceMinKm: real('flat_pace_min_km'),
  climbingPaceMinKm: real('climbing_pace_min_km'),
  descendingPaceMinKm: real('descending_pace_min_km'),
  fatigueFactor: real('fatigue_factor').default(1.06),
  recencyHalfLifeDays: integer('recency_half_life_days').default(90),
  lastCalculatedAt: timestamp('last_calculated_at'),
  profileData: jsonb('profile_data'), // Detailed performance data by gradient, distance, etc.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Race plans
export const racePlans = pgTable('race_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  raceId: uuid('race_id').references(() => races.id).notNull(),
  name: text('name'),
  basePaceMinKm: real('base_pace_min_km'),
  nighttimeSlowdown: real('nighttime_slowdown').default(0.15),
  startTime: timestamp('start_time'),
  predictedFinishTime: timestamp('predicted_finish_time'),
  predictedTotalMinutes: real('predicted_total_minutes'),
  aidStationPredictions: jsonb('aid_station_predictions'), // Array of predictions per station
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User sessions (for "last viewed race" functionality)
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  lastRaceId: uuid('last_race_id').references(() => races.id),
  lastPlanId: uuid('last_plan_id').references(() => racePlans.id),
  sessionData: jsonb('session_data'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Activity metrics table (TimescaleDB hypertable for time-series GPS data)
export const activityMetrics = pgTable('activity_metrics', {
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  activityId: uuid('activity_id').references(() => userActivities.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  elevationM: real('elevation_m'),
  distanceKm: real('distance_km').notNull(),
  elapsedSeconds: integer('elapsed_seconds').notNull(),
  movingTimeSeconds: integer('moving_time_seconds'),
  instantPaceMinKm: real('instant_pace_min_km'),
  smoothedPaceMinKm: real('smoothed_pace_min_km'),
  gradeAdjustedPaceMinKm: real('grade_adjusted_pace_min_km'),
  gradientPercent: real('gradient_percent'),
  cumulativeElevationGainM: real('cumulative_elevation_gain_m'),
  cumulativeElevationLossM: real('cumulative_elevation_loss_m'),
  heartRateBpm: integer('heart_rate_bpm'),
  cadenceSpm: integer('cadence_spm'),
  powerWatts: integer('power_watts'),
  segmentIndex: integer('segment_index').default(0),
  isMoving: boolean('is_moving').default(true),
  isPaused: boolean('is_paused').default(false),
});

// Export all tables
export const schema = {
  users,
  races,
  raceVersions,
  aidStations,
  userActivities,
  userPerformanceProfiles,
  racePlans,
  userSessions,
  activityMetrics,
};
