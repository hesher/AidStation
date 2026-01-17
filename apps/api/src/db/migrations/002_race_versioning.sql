-- Migration: 002_race_versioning
-- Description: Add race version tracking for change history
-- Created: 2024-01-17

-- Race versions table - stores a snapshot each time a race is modified
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
    
    -- Aid stations snapshot (stored as JSONB for simplicity)
    aid_stations_snapshot JSONB,
    
    -- Version metadata
    change_summary TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for querying version history
CREATE INDEX IF NOT EXISTS idx_race_versions_race ON race_versions(race_id);
CREATE INDEX IF NOT EXISTS idx_race_versions_number ON race_versions(race_id, version_number DESC);

-- Add current version number to races table
ALTER TABLE races ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

-- Function to automatically create a version snapshot on race update
CREATE OR REPLACE FUNCTION create_race_version_on_update()
RETURNS TRIGGER AS $$
DECLARE
    aid_stations_json JSONB;
BEGIN
    -- Get current aid stations as JSON
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', name,
            'distance_km', distance_km,
            'distance_from_prev_km', distance_from_prev_km,
            'elevation_m', elevation_m,
            'elevation_gain_from_prev_m', elevation_gain_from_prev_m,
            'elevation_loss_from_prev_m', elevation_loss_from_prev_m,
            'has_drop_bag', has_drop_bag,
            'has_crew', has_crew,
            'has_pacer', has_pacer,
            'cutoff_time', cutoff_time,
            'cutoff_hours_from_start', cutoff_hours_from_start,
            'sort_order', sort_order,
            'latitude', latitude,
            'longitude', longitude
        )
        ORDER BY sort_order
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
        changed_by
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
        COALESCE(aid_stations_json, '[]'::jsonb),
        NEW.owner_id
    );
    
    -- Increment the version number
    NEW.version_number := COALESCE(OLD.version_number, 1) + 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for race versioning (only if there are actual changes)
DROP TRIGGER IF EXISTS race_version_trigger ON races;
CREATE TRIGGER race_version_trigger
    BEFORE UPDATE ON races
    FOR EACH ROW
    WHEN (
        OLD.name IS DISTINCT FROM NEW.name OR
        OLD.date IS DISTINCT FROM NEW.date OR
        OLD.location IS DISTINCT FROM NEW.location OR
        OLD.country IS DISTINCT FROM NEW.country OR
        OLD.distance_km IS DISTINCT FROM NEW.distance_km OR
        OLD.elevation_gain_m IS DISTINCT FROM NEW.elevation_gain_m OR
        OLD.elevation_loss_m IS DISTINCT FROM NEW.elevation_loss_m OR
        OLD.start_time IS DISTINCT FROM NEW.start_time OR
        OLD.overall_cutoff_hours IS DISTINCT FROM NEW.overall_cutoff_hours OR
        OLD.course_gpx IS DISTINCT FROM NEW.course_gpx OR
        OLD.is_public IS DISTINCT FROM NEW.is_public OR
        OLD.metadata IS DISTINCT FROM NEW.metadata
    )
    EXECUTE FUNCTION create_race_version_on_update();
