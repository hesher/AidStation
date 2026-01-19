-- Migration: 006_cutoff_day_offset.sql
-- Purpose: Add day offset field to aid stations for multi-day event support
-- When cutoff times span multiple days (e.g., 100-mile races with 30h, 40h, 50h cutoffs),
-- we need to track which day the cutoff occurs on for display purposes.

-- Add cutoff_day_offset to aid_stations table
-- This represents the day offset from race start (0 = race day, 1 = day 2, etc.)
ALTER TABLE aid_stations
ADD COLUMN IF NOT EXISTS cutoff_day_offset INTEGER;

-- Calculate and populate cutoff_day_offset from existing cutoff_hours_from_start
-- Day offset = floor(hours / 24)
UPDATE aid_stations
SET cutoff_day_offset = FLOOR(cutoff_hours_from_start / 24)::INTEGER
WHERE cutoff_hours_from_start IS NOT NULL;

-- Add index for querying by day
CREATE INDEX IF NOT EXISTS idx_aid_stations_cutoff_day ON aid_stations(cutoff_day_offset);

-- Add a comment explaining the field
COMMENT ON COLUMN aid_stations.cutoff_day_offset IS 'Day offset from race start (0 = race day, 1 = day 2, etc.). Calculated as floor(cutoff_hours_from_start / 24).';
