-- Migration: 003_activity_metrics_hypertable
-- Description: Create TimescaleDB hypertable for time-series GPS/activity data
-- Created: 2026-01-18

-- Enable TimescaleDB if available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'TimescaleDB extension not available - time-series features will be disabled';
END;
$$;

-- Create the activity_metrics table for storing time-series GPS data points
-- This table stores individual GPS track points with calculated metrics
CREATE TABLE IF NOT EXISTS activity_metrics (
    -- Time is the primary dimension for TimescaleDB
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Foreign key to the activity
    activity_id UUID NOT NULL REFERENCES user_activities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- GPS data
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    elevation_m REAL,
    
    -- Cumulative distance from start
    distance_km REAL NOT NULL,
    
    -- Time metrics
    elapsed_seconds INTEGER NOT NULL,
    moving_time_seconds INTEGER,
    
    -- Calculated pace metrics
    instant_pace_min_km REAL,                    -- Raw pace at this point
    smoothed_pace_min_km REAL,                   -- Kalman-filtered pace
    grade_adjusted_pace_min_km REAL,             -- Pace adjusted for gradient
    
    -- Gradient/terrain
    gradient_percent REAL,                        -- Current gradient (positive = uphill)
    cumulative_elevation_gain_m REAL,            -- Total climb from start
    cumulative_elevation_loss_m REAL,            -- Total descent from start
    
    -- Heart rate (if available)
    heart_rate_bpm INTEGER,
    
    -- Cadence (if available)
    cadence_spm INTEGER,
    
    -- Power (if available, for cycling/running power meters)
    power_watts INTEGER,
    
    -- Segment identifier (for chunked analysis)
    segment_index INTEGER DEFAULT 0,              -- Which 1km segment this point belongs to
    
    -- Quality flags
    is_moving BOOLEAN DEFAULT TRUE,               -- Was the athlete moving at this point
    is_paused BOOLEAN DEFAULT FALSE,              -- Was recording paused
    
    -- Primary key includes time for TimescaleDB partitioning
    PRIMARY KEY (recorded_at, activity_id)
);

-- Create indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_activity_metrics_activity ON activity_metrics(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_user ON activity_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_distance ON activity_metrics(activity_id, distance_km);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_user_time ON activity_metrics(user_id, recorded_at DESC);

-- Convert to hypertable if TimescaleDB is available
-- The hypertable is partitioned by time for efficient time-series queries
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        -- Create hypertable with 7-day chunks
        PERFORM create_hypertable(
            'activity_metrics',
            'recorded_at',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE
        );
        
        -- Enable compression for older chunks (older than 30 days)
        -- This significantly reduces storage for historical data
        ALTER TABLE activity_metrics SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'activity_id,user_id',
            timescaledb.compress_orderby = 'recorded_at'
        );
        
        -- Create compression policy to automatically compress chunks older than 30 days
        -- This runs as a background job
        PERFORM add_compression_policy('activity_metrics', INTERVAL '30 days', if_not_exists => TRUE);
        
        RAISE NOTICE 'TimescaleDB hypertable created for activity_metrics';
    ELSE
        RAISE NOTICE 'TimescaleDB not available - activity_metrics created as regular table';
    END IF;
END;
$$;

-- Create aggregated view for performance analysis
-- This view provides per-kilometer segment statistics
CREATE OR REPLACE VIEW activity_segment_stats AS
SELECT 
    activity_id,
    user_id,
    segment_index,
    MIN(recorded_at) as segment_start_time,
    MAX(recorded_at) as segment_end_time,
    MIN(distance_km) as segment_start_km,
    MAX(distance_km) as segment_end_km,
    AVG(gradient_percent) as avg_gradient,
    AVG(smoothed_pace_min_km) FILTER (WHERE is_moving) as avg_pace_min_km,
    AVG(grade_adjusted_pace_min_km) FILTER (WHERE is_moving) as avg_gap_min_km,
    MAX(cumulative_elevation_gain_m) - MIN(cumulative_elevation_gain_m) as segment_elevation_gain_m,
    MAX(cumulative_elevation_loss_m) - MIN(cumulative_elevation_loss_m) as segment_elevation_loss_m,
    AVG(heart_rate_bpm) FILTER (WHERE heart_rate_bpm IS NOT NULL) as avg_heart_rate,
    COUNT(*) FILTER (WHERE is_moving) as moving_point_count,
    COUNT(*) as total_point_count
FROM activity_metrics
GROUP BY activity_id, user_id, segment_index;

-- Create view for gradient-based performance
-- Buckets performance by gradient ranges for training profile building
CREATE OR REPLACE VIEW gradient_performance AS
SELECT 
    user_id,
    activity_id,
    CASE 
        WHEN gradient_percent < -15 THEN 'steep_descent'
        WHEN gradient_percent < -8 THEN 'moderate_descent'
        WHEN gradient_percent < -3 THEN 'gentle_descent'
        WHEN gradient_percent < 3 THEN 'flat'
        WHEN gradient_percent < 8 THEN 'gentle_climb'
        WHEN gradient_percent < 15 THEN 'moderate_climb'
        ELSE 'steep_climb'
    END as gradient_category,
    AVG(grade_adjusted_pace_min_km) FILTER (WHERE is_moving AND grade_adjusted_pace_min_km > 0) as avg_gap,
    AVG(smoothed_pace_min_km) FILTER (WHERE is_moving AND smoothed_pace_min_km > 0) as avg_actual_pace,
    COUNT(*) as point_count,
    SUM(CASE WHEN is_moving THEN 1 ELSE 0 END) as moving_count
FROM activity_metrics
WHERE smoothed_pace_min_km IS NOT NULL 
  AND smoothed_pace_min_km > 0 
  AND smoothed_pace_min_km < 30  -- Filter out unrealistic values
GROUP BY user_id, activity_id, gradient_category;

-- Add comment for documentation
COMMENT ON TABLE activity_metrics IS 'Time-series GPS data points for user activities, stored as TimescaleDB hypertable when available';
COMMENT ON VIEW activity_segment_stats IS 'Aggregated statistics per 1km segment for performance analysis';
COMMENT ON VIEW gradient_performance IS 'Performance grouped by gradient categories for training profile building';
