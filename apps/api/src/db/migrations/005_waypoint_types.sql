-- Migration: 005_waypoint_types
-- Description: Add waypoint_type column to aid_stations for flexible waypoint categorization
-- Created: 2024-01-18

-- Add waypoint_type column to aid_stations table
-- This allows flagging waypoints as different types: aid_station, water_stop, view_point, toilet, milestone, etc.
ALTER TABLE aid_stations ADD COLUMN IF NOT EXISTS waypoint_type TEXT DEFAULT 'aid_station';

-- Update existing rows to have the default waypoint_type
UPDATE aid_stations SET waypoint_type = 'aid_station' WHERE waypoint_type IS NULL;

-- Create waypoint_types lookup table for standardized types and their display info
CREATE TABLE IF NOT EXISTS waypoint_types (
    type_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT
);

-- Insert standard waypoint types
INSERT INTO waypoint_types (type_id, display_name, description, icon, color) VALUES
    ('aid_station', 'Aid Station', 'Full aid station with supplies and support', '🏕️', '#4CAF50'),
    ('water_stop', 'Water Stop', 'Water-only station', '💧', '#2196F3'),
    ('view_point', 'View Point', 'Scenic viewpoint or landmark', '🏔️', '#9C27B0'),
    ('toilet', 'Restroom', 'Restroom or portable toilet', '🚻', '#795548'),
    ('milestone', 'Milestone', 'Distance or progress marker', '📍', '#FF9800'),
    ('peak', 'Peak/Summit', 'Mountain peak or highest point', '⛰️', '#E91E63'),
    ('start', 'Start', 'Race start point', '🏁', '#4CAF50'),
    ('finish', 'Finish', 'Race finish line', '🎯', '#F44336'),
    ('checkpoint', 'Checkpoint', 'Timing checkpoint or control point', '⏱️', '#607D8B'),
    ('custom', 'Custom', 'User-defined waypoint type', '📌', '#9E9E9E')
ON CONFLICT (type_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color;

-- Add index for querying by waypoint type
CREATE INDEX IF NOT EXISTS idx_aid_stations_waypoint_type ON aid_stations(waypoint_type);

-- Add comment for documentation
COMMENT ON COLUMN aid_stations.waypoint_type IS 'Type of waypoint: aid_station, water_stop, view_point, toilet, milestone, peak, checkpoint, custom, etc.';
