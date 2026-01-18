-- Migration: 004_terrain_types
-- Description: Add terrain type support for aid stations and race segments
-- Created: 2026-01-18

-- Add terrain_type to aid_stations table
ALTER TABLE aid_stations ADD COLUMN IF NOT EXISTS terrain_type TEXT DEFAULT 'trail';

-- Create terrain type enum documentation
-- Valid values:
--   'road' - Paved road (fastest, factor: 1.0)
--   'gravel' - Gravel or fire road (factor: 1.02)
--   'double_track' - Wide dirt path (factor: 1.05)
--   'single_track' - Single track trail (factor: 1.10)
--   'technical' - Technical rocky/rooty trail (factor: 1.18)
--   'alpine' - Alpine/above treeline terrain (factor: 1.22)
--   'sand' - Sand or beach (factor: 1.25)
--   'snow' - Snow/ice conditions (factor: 1.30)
--   'mixed' - Mixed terrain (factor: 1.08)
--   'trail' - Default trail (factor: 1.05)

-- Add terrain_type to the race metadata for segment-level terrain info
COMMENT ON COLUMN aid_stations.terrain_type IS 'Type of terrain in the segment leading TO this aid station. Affects pace predictions.';

-- Create terrain_factors lookup table for consistent calculations
CREATE TABLE IF NOT EXISTS terrain_factors (
    terrain_type TEXT PRIMARY KEY,
    pace_factor REAL NOT NULL,
    description TEXT,
    icon TEXT
);

-- Insert terrain factor data
INSERT INTO terrain_factors (terrain_type, pace_factor, description, icon) VALUES
    ('road', 1.00, 'Paved road - fastest surface', '🛣️'),
    ('gravel', 1.02, 'Gravel or fire road', '⛰️'),
    ('double_track', 1.05, 'Wide dirt path or jeep track', '🚜'),
    ('single_track', 1.10, 'Single track trail', '🥾'),
    ('technical', 1.18, 'Technical rocky or rooty trail', '⚠️'),
    ('alpine', 1.22, 'Alpine terrain above treeline', '🏔️'),
    ('sand', 1.25, 'Sand, beach, or soft surface', '🏖️'),
    ('snow', 1.30, 'Snow or ice conditions', '❄️'),
    ('mixed', 1.08, 'Mixed terrain types', '🔀'),
    ('trail', 1.05, 'Default trail surface', '🌲')
ON CONFLICT (terrain_type) DO UPDATE SET
    pace_factor = EXCLUDED.pace_factor,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon;

-- Add index for faster terrain lookups
CREATE INDEX IF NOT EXISTS idx_aid_stations_terrain ON aid_stations(terrain_type);

-- Add terrain_breakdown to race metadata for segment-level detail
-- This allows storing detailed terrain info per segment within the race metadata JSONB
COMMENT ON TABLE terrain_factors IS 'Lookup table for terrain-based pace adjustment factors';
