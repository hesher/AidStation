/**
 * Task Queue Service
 *
 * High-level typed wrappers for submitting tasks to the Python Celery workers.
 * This provides a clean API for the Node.js application to use the worker services.
 */

import { celeryClient, CeleryTaskResult } from './celery-client';

/**
 * Task names for GPX/FIT analysis
 */
export const GPX_TASKS = {
    ANALYZE_GPX_COURSE: 'analyze_gpx_course',
    ANALYZE_GPX: 'analyze_gpx',
    ANALYZE_USER_ACTIVITY: 'analyze_user_activity',
    CALCULATE_AID_STATION_METRICS: 'calculate_aid_station_metrics',
    CALCULATE_GAP: 'calculate_gap',
    SMOOTH_ELEVATION: 'smooth_elevation',
    CALCULATE_PERFORMANCE_PROFILE: 'calculate_performance_profile',
} as const;

/**
 * Task names for predictions
 */
export const PREDICTION_TASKS = {
    PREDICT_RACE_TIME: 'predict_race_time',
    CALCULATE_FATIGUE_FACTOR: 'calculate_fatigue_factor',
    PREDICT_AID_STATION_TIMES: 'predict_aid_station_times',
} as const;

/**
 * Task submission result
 */
export interface TaskSubmission {
    taskId: string;
    submitted: boolean;
}

/**
 * Task status
 */
export interface TaskStatus<T = unknown> {
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: T;
    error?: string;
}

/**
 * Course analysis result
 */
export interface CourseAnalysisResult {
    success: boolean;
    course_stats?: {
        total_distance_km: number;
        total_elevation_gain_m: number;
        total_elevation_loss_m: number;
        min_elevation_m: number;
        max_elevation_m: number;
        avg_grade_percent: number;
        steep_sections_count: number;
    };
    elevation_profile?: Array<{
        distance_km: number;
        elevation_m: number;
        grade_percent: number;
    }>;
    aid_stations?: Array<{
        name: string;
        distance_km: number;
        elevation_m: number;
        distance_from_prev_km: number;
        elevation_gain_from_prev_m: number;
        elevation_loss_from_prev_m: number;
    }>;
    coordinates?: Array<{
        lat: number;
        lon: number;
        elevation?: number;
    }>;
    error?: string;
}

/**
 * Activity analysis result
 */
export interface ActivityAnalysisResult {
    success: boolean;
    analysis?: {
        activity_id: string;
        name?: string;
        activity_date?: string;
        total_distance_km: number;
        elevation_gain_m: number;
        elevation_loss_m: number;
        total_time_seconds: number;
        moving_time_seconds: number;
        stopped_time_seconds: number;
        average_pace_min_km: number;
        grade_adjusted_pace_min_km: number;
        pace_by_gradient: Record<string, number>;
        fatigue_curve: number[];
        fatigue_factor: number;
        segment_count: number;
    };
    error?: string;
}

/**
 * Performance profile result
 */
export interface PerformanceProfileResult {
    success: boolean;
    profile?: {
        flat_pace_min_km: number;
        climbing_pace_by_grade: Record<string, number>;
        descending_pace_by_grade: Record<string, number>;
        fatigue_factor: number;
        activities_count: number;
        total_distance_km: number;
        total_elevation_gain_m: number;
    };
    error?: string;
}

/**
 * Race time prediction result
 */
export interface RaceTimePredictionResult {
    predicted_time_minutes: number;
    predicted_time_formatted: string;
    predicted_pace_min_km: number;
    predicted_pace_formatted: string;
    fatigue_factor_used: number;
}

/**
 * Aid station prediction result
 */
export interface AidStationPrediction {
    name: string;
    distance_km: number;
    predicted_arrival_time: string;
    elapsed_time_minutes: number;
    segment_pace_min_km: number;
    buffer_minutes: number | null;
    cutoff_status: 'green' | 'orange' | 'red';
    is_night_segment: boolean;
}

/**
 * Task Queue - High-level interface for submitting tasks
 */
export class TaskQueue {
    /**
     * Analyze a GPX course file
     */
    static async analyzeGpxCourse(
        gpxContent: string,
        aidStations?: Array<{ name: string; distanceKm?: number; lat?: number; lon?: number }>
    ): Promise<CeleryTaskResult<CourseAnalysisResult>> {
        return celeryClient.submitAndWait<CourseAnalysisResult>(
            GPX_TASKS.ANALYZE_GPX_COURSE,
            [gpxContent, aidStations || []],
            {},
            60000 // 60 second timeout for large GPX files
        );
    }

    /**
     * Analyze a GPX course (fire and forget)
     */
    static async submitGpxCourseAnalysis(
        gpxContent: string,
        aidStations?: Array<{ name: string; distanceKm?: number; lat?: number; lon?: number }>
    ): Promise<TaskSubmission> {
        const taskId = await celeryClient.submitTask(
            GPX_TASKS.ANALYZE_GPX_COURSE,
            [gpxContent, aidStations || []],
            {}
        );
        return { taskId, submitted: true };
    }

    /**
     * Analyze a user activity GPX file
     */
    static async analyzeUserActivity(
        activityId: string,
        gpxContent: string
    ): Promise<CeleryTaskResult<ActivityAnalysisResult>> {
        return celeryClient.submitAndWait<ActivityAnalysisResult>(
            GPX_TASKS.ANALYZE_USER_ACTIVITY,
            [activityId, gpxContent],
            {},
            60000
        );
    }

    /**
     * Submit a user activity for analysis (fire and forget)
     */
    static async submitUserActivityAnalysis(
        activityId: string,
        gpxContent: string
    ): Promise<TaskSubmission> {
        const taskId = await celeryClient.submitTask(
            GPX_TASKS.ANALYZE_USER_ACTIVITY,
            [activityId, gpxContent],
            {}
        );
        return { taskId, submitted: true };
    }

    /**
     * Calculate a user's performance profile from multiple activities
     */
    static async calculatePerformanceProfile(
        activityAnalyses: ActivityAnalysisResult[],
        recencyHalfLifeDays: number = 90
    ): Promise<CeleryTaskResult<PerformanceProfileResult>> {
        return celeryClient.submitAndWait<PerformanceProfileResult>(
            GPX_TASKS.CALCULATE_PERFORMANCE_PROFILE,
            [activityAnalyses, recencyHalfLifeDays],
            {},
            30000
        );
    }

    /**
     * Predict race time using Riegel formula
     */
    static async predictRaceTime(
        knownDistanceKm: number,
        knownTimeMinutes: number,
        targetDistanceKm: number,
        fatigueFactor: number = 1.06
    ): Promise<CeleryTaskResult<RaceTimePredictionResult>> {
        return celeryClient.submitAndWait<RaceTimePredictionResult>(
            PREDICTION_TASKS.PREDICT_RACE_TIME,
            [knownDistanceKm, knownTimeMinutes, targetDistanceKm, fatigueFactor],
            {},
            5000
        );
    }

    /**
     * Calculate personalized fatigue factor from past races
     */
    static async calculateFatigueFactor(
        races: Array<{ distance_km: number; time_minutes: number }>
    ): Promise<CeleryTaskResult<{ fatigue_factor: number; confidence: string; races_analyzed: number }>> {
        return celeryClient.submitAndWait(
            PREDICTION_TASKS.CALCULATE_FATIGUE_FACTOR,
            [races],
            {},
            5000
        );
    }

    /**
     * Predict arrival times at each aid station
     */
    static async predictAidStationTimes(
        aidStations: Array<{
            name: string;
            distance_km: number;
            elevation_gain_from_prev?: number;
            cutoff_time_iso?: string;
        }>,
        basePaceMinKm: number,
        startTimeIso: string,
        nighttimeSlowdown: number = 0.15,
        fatigueCurve?: number[]
    ): Promise<CeleryTaskResult<AidStationPrediction[]>> {
        return celeryClient.submitAndWait<AidStationPrediction[]>(
            PREDICTION_TASKS.PREDICT_AID_STATION_TIMES,
            [aidStations, basePaceMinKm, startTimeIso, nighttimeSlowdown, fatigueCurve || null],
            {},
            10000
        );
    }

    /**
     * Get the status of a submitted task
     */
    static async getTaskStatus<T = unknown>(taskId: string): Promise<TaskStatus<T>> {
        const result = await celeryClient.getResult<T>(taskId);

        if (!result) {
            return { taskId, status: 'pending' };
        }

        switch (result.status) {
            case 'PENDING':
                return { taskId, status: 'pending' };
            case 'STARTED':
                return { taskId, status: 'running' };
            case 'SUCCESS':
                return { taskId, status: 'completed', result: result.result };
            case 'FAILURE':
                return { taskId, status: 'failed', error: result.error };
            default:
                return { taskId, status: 'pending' };
        }
    }

    /**
     * Check if Redis is connected
     */
    static isConnected(): boolean {
        return celeryClient.isConnected();
    }
}
