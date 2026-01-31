-- Migration: Add start_cutoff_hours field
-- Purpose: Add start cutoff hours field to races and race_versions tables for editing cutoff time on the Start row

-- Add start_cutoff_hours column to races table
ALTER TABLE races ADD COLUMN IF NOT EXISTS start_cutoff_hours REAL;

-- Add start_cutoff_hours column to race_versions table for version history
ALTER TABLE race_versions ADD COLUMN IF NOT EXISTS start_cutoff_hours REAL;
