-- Migration: 001_initial_schema
-- Description: Initial database schema for AidStation
-- Created: 2024-01-16

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostGIS is optional - try to create it but don't fail if not available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "postgis";
EXCEPTION WHEN others THEN
    RAISE NOTICE 'PostGIS extension not available - geometry features will be disabled';
END;
$$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Races table (works with or without PostGIS)
CREATE TABLE IF NOT EXISTS races (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    metadata JSONB
);

-- Add geometry column if PostGIS is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'ALTER TABLE races ADD COLUMN IF NOT EXISTS course_geometry GEOMETRY(LineString, 4326)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_races_geometry ON races USING GIST (course_geometry)';
    END IF;
END;
$$;

-- Aid stations table
CREATE TABLE IF NOT EXISTS aid_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    distance_km REAL NOT NULL,
    distance_from_prev_km REAL,
    elevation_m REAL,
    elevation_gain_from_prev_m REAL,
    elevation_loss_from_prev_m REAL,
    has_drop_bag BOOLEAN DEFAULT FALSE,
    has_crew BOOLEAN DEFAULT FALSE,
    has_pacer BOOLEAN DEFAULT FALSE,
    cutoff_time TEXT,
    cutoff_hours_from_start REAL,
    sort_order INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aid_stations_race ON aid_stations(race_id);

-- User activities (GPX uploads) - works with or without PostGIS
CREATE TABLE IF NOT EXISTS user_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT,
    activity_date TIMESTAMP WITH TIME ZONE,
    distance_km REAL,
    elevation_gain_m REAL,
    elevation_loss_m REAL,
    moving_time_seconds INTEGER,
    total_time_seconds INTEGER,
    average_pace_min_km REAL,
    grade_adjusted_pace_min_km REAL,
    gpx_content TEXT,
    analysis_results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_activities_user ON user_activities(user_id);

-- Add geometry column and index if PostGIS is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'ALTER TABLE user_activities ADD COLUMN IF NOT EXISTS activity_geometry GEOMETRY(LineString, 4326)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_activities_geometry ON user_activities USING GIST (activity_geometry)';
    END IF;
END;
$$;

-- User performance profiles
CREATE TABLE IF NOT EXISTS user_performance_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    flat_pace_min_km REAL,
    climbing_pace_min_km REAL,
    descending_pace_min_km REAL,
    fatigue_factor REAL DEFAULT 1.06,
    recency_half_life_days INTEGER DEFAULT 90,
    last_calculated_at TIMESTAMP WITH TIME ZONE,
    profile_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Race plans
CREATE TABLE IF NOT EXISTS race_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    name TEXT,
    base_pace_min_km REAL,
    nighttime_slowdown REAL DEFAULT 0.15,
    start_time TIMESTAMP WITH TIME ZONE,
    predicted_finish_time TIMESTAMP WITH TIME ZONE,
    predicted_total_minutes REAL,
    aid_station_predictions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_race_plans_user ON race_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_race_plans_race ON race_plans(race_id);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_race_id UUID REFERENCES races(id) ON DELETE SET NULL,
    last_plan_id UUID REFERENCES race_plans(id) ON DELETE SET NULL,
    session_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_races_updated_at BEFORE UPDATE ON races
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_race_plans_updated_at BEFORE UPDATE ON race_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_performance_profiles_updated_at BEFORE UPDATE ON user_performance_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
