-- Migration: 002_race_versions
-- Description: Add race versioning support for tracking changes
-- Created: 2026-01-18

-- Add version_number column to races table
ALTER TABLE races ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1 NOT NULL;

-- Create race_versions table to store version history
CREATE TABLE IF NOT EXISTS race_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Snapshot of race data at this version
    name TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    country TEXT,
    distance_km REAL,
    elevation_gain_m REAL,
    elevation_loss_m REAL,
    start_time TEXT,
    overall_cutoff_hours REAL,
    course_gpx TEXT,
    is_public BOOLEAN,
    metadata JSONB,
    
    -- Snapshot of aid stations at this version
    aid_stations_snapshot JSONB,
    
    -- Version metadata
    change_summary TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Ensure unique version numbers per race
    UNIQUE(race_id, version_number)
);

-- Index for faster version history lookups
CREATE INDEX IF NOT EXISTS idx_race_versions_race ON race_versions(race_id);
CREATE INDEX IF NOT EXISTS idx_race_versions_race_version ON race_versions(race_id, version_number DESC);

-- Function to create a version snapshot before updating a race
-- This is triggered automatically when a race is updated
CREATE OR REPLACE FUNCTION create_race_version()
RETURNS TRIGGER AS $$
DECLARE
    aid_stations_json JSONB;
BEGIN
    -- Only create version if there are actual changes to track
    -- Compare key fields that indicate meaningful changes
    IF OLD.name = NEW.name 
       AND OLD.date IS NOT DISTINCT FROM NEW.date
       AND OLD.location IS NOT DISTINCT FROM NEW.location
       AND OLD.country IS NOT DISTINCT FROM NEW.country
       AND OLD.distance_km IS NOT DISTINCT FROM NEW.distance_km
       AND OLD.elevation_gain_m IS NOT DISTINCT FROM NEW.elevation_gain_m
       AND OLD.elevation_loss_m IS NOT DISTINCT FROM NEW.elevation_loss_m
       AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
       AND OLD.overall_cutoff_hours IS NOT DISTINCT FROM NEW.overall_cutoff_hours
       AND OLD.course_gpx IS NOT DISTINCT FROM NEW.course_gpx
       AND OLD.is_public IS NOT DISTINCT FROM NEW.is_public
       AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
    THEN
        -- No meaningful changes, skip versioning
        RETURN NEW;
    END IF;

    -- Get current aid stations for this race as JSON
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'name', name,
                'distanceKm', distance_km,
                'distanceFromPrevKm', distance_from_prev_km,
                'elevationM', elevation_m,
                'elevationGainFromPrevM', elevation_gain_from_prev_m,
                'elevationLossFromPrevM', elevation_loss_from_prev_m,
                'hasDropBag', has_drop_bag,
                'hasCrew', has_crew,
                'hasPacer', has_pacer,
                'cutoffTime', cutoff_time,
                'cutoffHoursFromStart', cutoff_hours_from_start,
                'latitude', latitude,
                'longitude', longitude
            ) ORDER BY sort_order
        ),
        '[]'::jsonb
    ) INTO aid_stations_json
    FROM aid_stations
    WHERE race_id = OLD.id;

    -- Insert the OLD version into race_versions
    INSERT INTO race_versions (
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
        change_summary
    ) VALUES (
        OLD.id,
        OLD.version_number,
        OLD.name,
        OLD.date,
        OLD.location,
        OLD.country,
        OLD.distance_km,
        OLD.elevation_gain_m,
        OLD.elevation_loss_m,
        OLD.start_time,
        OLD.overall_cutoff_hours,
        OLD.course_gpx,
        OLD.is_public,
        OLD.metadata,
        aid_stations_json,
        'Version ' || OLD.version_number || ' archived'
    );

    -- Increment the version number on the race
    NEW.version_number := OLD.version_number + 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically version races before update
DROP TRIGGER IF EXISTS race_versioning_trigger ON races;
CREATE TRIGGER race_versioning_trigger
    BEFORE UPDATE ON races
    FOR EACH ROW
    EXECUTE FUNCTION create_race_version();

-- Add comment for documentation
COMMENT ON TABLE race_versions IS 'Stores historical versions of races for change tracking and rollback functionality';
COMMENT ON COLUMN race_versions.aid_stations_snapshot IS 'JSON array of aid stations at the time of this version';
COMMENT ON COLUMN race_versions.change_summary IS 'Optional description of what changed in this version';
