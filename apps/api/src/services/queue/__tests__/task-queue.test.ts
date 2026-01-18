/**
 * Task Queue Tests
 *
 * Tests for the Celery client and task queue service.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// Store mock result data
let mockGetResult: string | null = null;
let mockLpushCalls: Array<{ queue: string; message: string }> = [];

// Mock ioredis before importing the celery client
vi.mock('ioredis', () => {
    // Create a mock Redis class inside the factory
    class MockRedis {
        status = 'ready';
        private handlers: Record<string, (() => void)[]> = {};

        on(event: string, handler: () => void) {
            if (!this.handlers[event]) {
                this.handlers[event] = [];
            }
            this.handlers[event].push(handler);
            // Trigger connect immediately
            if (event === 'connect') {
                setTimeout(() => handler(), 0);
            }
            return this;
        }

        async lpush(queue: string, message: string) {
            mockLpushCalls.push({ queue, message });
            return 1;
        }

        async get() {
            return mockGetResult;
        }

        async sadd() {
            return 1;
        }

        async quit() {
            return 'OK';
        }
    }

    return {
        default: MockRedis,
    };
});

import { CeleryClient } from '../celery-client';
import { TaskQueue, GPX_TASKS, PREDICTION_TASKS } from '../task-queue';

describe('CeleryClient', () => {
    let client: CeleryClient;

    beforeAll(() => {
        client = new CeleryClient({
            redisUrl: 'redis://localhost:6379/0',
        });
    });

    beforeEach(() => {
        mockGetResult = null;
        mockLpushCalls = [];
    });

    afterAll(async () => {
        await client.close();
    });

    describe('constructor', () => {
        it('should create client with default options', () => {
            const defaultClient = new CeleryClient();
            expect(defaultClient).toBeDefined();
        });

        it('should create client with custom options', () => {
            const customClient = new CeleryClient({
                redisUrl: 'redis://custom:6379/1',
                defaultQueue: 'custom_queue',
                resultExpireSeconds: 3600,
            });
            expect(customClient).toBeDefined();
        });
    });

    describe('isConnected', () => {
        it('should report connection status', async () => {
            // Wait for connect event to fire
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(client.isConnected()).toBe(true);
        });
    });

    describe('submitTask', () => {
        it('should return a task ID when submitting a task', async () => {
            const taskId = await client.submitTask('test_task', ['arg1', 'arg2'], { key: 'value' });

            expect(taskId).toBeDefined();
            expect(typeof taskId).toBe('string');
            expect(taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });

        it('should submit to custom queue when specified', async () => {
            const taskId = await client.submitTask(
                'test_task',
                [],
                {},
                { queue: 'custom_queue' }
            );

            expect(taskId).toBeDefined();
            expect(mockLpushCalls.length).toBeGreaterThan(0);
            expect(mockLpushCalls[mockLpushCalls.length - 1].queue).toBe('custom_queue');
        });

        it('should support eta option for delayed execution', async () => {
            const eta = new Date(Date.now() + 60000);
            const taskId = await client.submitTask('test_task', [], {}, { eta });

            expect(taskId).toBeDefined();
            const lastCall = mockLpushCalls[mockLpushCalls.length - 1];
            const message = JSON.parse(lastCall.message);
            expect(message.headers.eta).toBe(eta.toISOString());
        });

        it('should support expires option', async () => {
            const expires = new Date(Date.now() + 120000);
            const taskId = await client.submitTask('test_task', [], {}, { expires });

            expect(taskId).toBeDefined();
            const lastCall = mockLpushCalls[mockLpushCalls.length - 1];
            const message = JSON.parse(lastCall.message);
            expect(message.headers.expires).toBe(expires.toISOString());
        });
    });

    describe('getResult', () => {
        it('should return PENDING status for unknown tasks', async () => {
            mockGetResult = null;
            const result = await client.getResult('unknown-task-id');

            expect(result).toBeDefined();
            expect(result?.status).toBe('PENDING');
        });

        it('should return SUCCESS status with result', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'test-task-id',
                status: 'SUCCESS',
                result: { data: 'test result' },
            });

            const result = await client.getResult<{ data: string }>('test-task-id');

            expect(result).toBeDefined();
            expect(result?.status).toBe('SUCCESS');
            expect(result?.result).toEqual({ data: 'test result' });
        });

        it('should return FAILURE status with error', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'failed-task-id',
                status: 'FAILURE',
                result: 'Task failed with error',
                traceback: 'Error traceback here',
            });

            const result = await client.getResult('failed-task-id');

            expect(result).toBeDefined();
            expect(result?.status).toBe('FAILURE');
            expect(result?.error).toBe('Task failed with error');
            expect(result?.traceback).toBe('Error traceback here');
        });

        it('should handle JSON object as error result', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'failed-task-id',
                status: 'FAILURE',
                result: { exc_type: 'ValueError', exc_message: 'Invalid value' },
            });

            const result = await client.getResult('failed-task-id');

            expect(result).toBeDefined();
            expect(result?.status).toBe('FAILURE');
            expect(result?.error).toContain('ValueError');
        });

        it('should return null for invalid JSON', async () => {
            mockGetResult = 'not valid json';

            const result = await client.getResult('test-task-id');

            expect(result).toBeNull();
        });

        it('should handle STARTED status', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'running-task-id',
                status: 'STARTED',
            });

            const result = await client.getResult('running-task-id');

            expect(result?.status).toBe('STARTED');
        });
    });

    describe('waitForResult', () => {
        it('should return result when task completes', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'test-task-id',
                status: 'SUCCESS',
                result: { completed: true },
            });

            const result = await client.waitForResult<{ completed: boolean }>('test-task-id', 1000, 100);

            expect(result.status).toBe('SUCCESS');
            expect(result.result).toEqual({ completed: true });
        });

        it('should timeout if task does not complete', async () => {
            mockGetResult = null; // Always return PENDING

            const result = await client.waitForResult('slow-task-id', 200, 50);

            expect(result.status).toBe('PENDING');
            expect(result.error).toContain('timed out');
        });
    });

    describe('submitAndWait', () => {
        it('should submit task and wait for result', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'test-task-id',
                status: 'SUCCESS',
                result: { done: true },
            });

            const result = await client.submitAndWait<{ done: boolean }>('test_task', ['arg'], {}, 1000);

            expect(result.status).toBe('SUCCESS');
            expect(result.result).toEqual({ done: true });
        });
    });

    describe('revokeTask', () => {
        it('should add task to revoked set', async () => {
            await client.revokeTask('task-to-revoke');
            // The mock doesn't throw, so test passes if no error
            expect(true).toBe(true);
        });
    });

    describe('close', () => {
        it('should close connections', async () => {
            const tempClient = new CeleryClient();
            await tempClient.close();
            // After close, isConnected should return false
            expect(tempClient.isConnected()).toBe(false);
        });
    });
});

describe('GPX_TASKS', () => {
    it('should define all GPX task names', () => {
        expect(GPX_TASKS.ANALYZE_GPX_COURSE).toBe('analyze_gpx_course');
        expect(GPX_TASKS.ANALYZE_GPX).toBe('analyze_gpx');
        expect(GPX_TASKS.ANALYZE_USER_ACTIVITY).toBe('analyze_user_activity');
        expect(GPX_TASKS.CALCULATE_AID_STATION_METRICS).toBe('calculate_aid_station_metrics');
        expect(GPX_TASKS.CALCULATE_GAP).toBe('calculate_gap');
        expect(GPX_TASKS.SMOOTH_ELEVATION).toBe('smooth_elevation');
        expect(GPX_TASKS.CALCULATE_PERFORMANCE_PROFILE).toBe('calculate_performance_profile');
    });
});

describe('PREDICTION_TASKS', () => {
    it('should define all prediction task names', () => {
        expect(PREDICTION_TASKS.PREDICT_RACE_TIME).toBe('predict_race_time');
        expect(PREDICTION_TASKS.CALCULATE_FATIGUE_FACTOR).toBe('calculate_fatigue_factor');
        expect(PREDICTION_TASKS.PREDICT_AID_STATION_TIMES).toBe('predict_aid_station_times');
    });
});

describe('TaskQueue', () => {
    beforeEach(() => {
        mockGetResult = null;
        mockLpushCalls = [];
    });

    describe('getTaskStatus', () => {
        it('should return pending status for unknown tasks', async () => {
            mockGetResult = null;
            const status = await TaskQueue.getTaskStatus('00000000-0000-0000-0000-000000000000');

            expect(status.status).toBe('pending');
        });

        it('should return completed status with result', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'completed-task',
                status: 'SUCCESS',
                result: { analysis: 'complete' },
            });

            const status = await TaskQueue.getTaskStatus<{ analysis: string }>('completed-task');

            expect(status.status).toBe('completed');
            expect(status.result).toEqual({ analysis: 'complete' });
        });

        it('should return failed status with error', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'failed-task',
                status: 'FAILURE',
                result: 'Processing failed',
            });

            const status = await TaskQueue.getTaskStatus('failed-task');

            expect(status.status).toBe('failed');
            expect(status.error).toBe('Processing failed');
        });

        it('should return running status for started tasks', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'running-task',
                status: 'STARTED',
            });

            const status = await TaskQueue.getTaskStatus('running-task');

            expect(status.status).toBe('running');
        });
    });

    describe('isConnected', () => {
        it('should report Redis connection status', async () => {
            // Wait for mock connect event
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(TaskQueue.isConnected()).toBe(true);
        });
    });

    describe('analyzeGpxCourse', () => {
        it('should submit GPX analysis task and wait for result', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'gpx-task',
                status: 'SUCCESS',
                result: {
                    success: true,
                    course_stats: {
                        total_distance_km: 42.195,
                        total_elevation_gain_m: 500,
                    },
                },
            });

            const result = await TaskQueue.analyzeGpxCourse('<gpx>content</gpx>', [
                { name: 'Aid 1', distanceKm: 10 },
            ]);

            expect(result.status).toBe('SUCCESS');
            expect(result.result?.success).toBe(true);
        });
    });

    describe('submitGpxCourseAnalysis', () => {
        it('should submit GPX analysis task fire-and-forget', async () => {
            const submission = await TaskQueue.submitGpxCourseAnalysis('<gpx>content</gpx>');

            expect(submission.submitted).toBe(true);
            expect(submission.taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
        });
    });

    describe('analyzeUserActivity', () => {
        it('should submit user activity analysis and wait', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'activity-task',
                status: 'SUCCESS',
                result: {
                    success: true,
                    analysis: {
                        activity_id: 'act-123',
                        total_distance_km: 15.5,
                        elevation_gain_m: 300,
                    },
                },
            });

            const result = await TaskQueue.analyzeUserActivity('act-123', '<gpx>data</gpx>', 'gpx');

            expect(result.status).toBe('SUCCESS');
            expect(result.result?.success).toBe(true);
        });

        it('should support FIT file type', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'fit-task',
                status: 'SUCCESS',
                result: { success: true },
            });

            const result = await TaskQueue.analyzeUserActivity('act-456', 'fit-binary-data', 'fit');

            expect(result.status).toBe('SUCCESS');
        });
    });

    describe('submitUserActivityAnalysis', () => {
        it('should submit activity analysis fire-and-forget', async () => {
            const submission = await TaskQueue.submitUserActivityAnalysis('act-789', '<gpx>data</gpx>');

            expect(submission.submitted).toBe(true);
            expect(submission.taskId).toBeDefined();
        });
    });

    describe('calculatePerformanceProfile', () => {
        it('should calculate performance profile from activities', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'profile-task',
                status: 'SUCCESS',
                result: {
                    success: true,
                    profile: {
                        flat_pace_min_km: 5.5,
                        fatigue_factor: 1.05,
                        activities_count: 3,
                    },
                },
            });

            const activities = [
                {
                    success: true,
                    analysis: {
                        activity_id: 'a1',
                        total_distance_km: 20,
                        elevation_gain_m: 500,
                        elevation_loss_m: 450,
                        total_time_seconds: 7200,
                        moving_time_seconds: 6800,
                        stopped_time_seconds: 400,
                        average_pace_min_km: 6.0,
                        grade_adjusted_pace_min_km: 5.5,
                        pace_by_gradient: { flat: 5.5, uphill: 8.0, downhill: 4.5 },
                        fatigue_curve: [1.0, 1.02, 1.05],
                        fatigue_factor: 1.05,
                        segment_count: 10,
                    },
                },
            ];

            const result = await TaskQueue.calculatePerformanceProfile(activities, 90);

            expect(result.status).toBe('SUCCESS');
            expect(result.result?.success).toBe(true);
        });
    });

    describe('predictRaceTime', () => {
        it('should predict race time using Riegel formula', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'predict-task',
                status: 'SUCCESS',
                result: {
                    predicted_time_minutes: 240,
                    predicted_time_formatted: '4:00:00',
                    predicted_pace_min_km: 5.7,
                    predicted_pace_formatted: '5:42',
                    fatigue_factor_used: 1.06,
                },
            });

            const result = await TaskQueue.predictRaceTime(21.1, 100, 42.195, 1.06);

            expect(result.status).toBe('SUCCESS');
            expect(result.result?.predicted_time_minutes).toBe(240);
        });
    });

    describe('calculateFatigueFactor', () => {
        it('should calculate personalized fatigue factor', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'fatigue-task',
                status: 'SUCCESS',
                result: {
                    fatigue_factor: 1.08,
                    confidence: 'high',
                    races_analyzed: 5,
                },
            });

            const races = [
                { distance_km: 10, time_minutes: 50 },
                { distance_km: 21.1, time_minutes: 110 },
            ];

            const result = await TaskQueue.calculateFatigueFactor(races);

            expect(result.status).toBe('SUCCESS');
            expect(result.result?.fatigue_factor).toBe(1.08);
        });
    });

    describe('predictAidStationTimes', () => {
        it('should predict aid station arrival times', async () => {
            mockGetResult = JSON.stringify({
                task_id: 'aid-predict-task',
                status: 'SUCCESS',
                result: [
                    {
                        name: 'Aid 1',
                        distance_km: 25,
                        predicted_arrival_time: '10:30:00',
                        elapsed_time_minutes: 150,
                        segment_pace_min_km: 6.0,
                        buffer_minutes: 30,
                        cutoff_status: 'green',
                        is_night_segment: false,
                    },
                ],
            });

            const aidStations = [
                { name: 'Aid 1', distance_km: 25, elevation_gain_from_prev: 500 },
            ];

            const result = await TaskQueue.predictAidStationTimes(
                aidStations,
                6.0,
                '2025-06-28T05:00:00Z',
                0.15,
                [1.0, 1.05, 1.1]
            );

            expect(result.status).toBe('SUCCESS');
            expect(result.result).toHaveLength(1);
            expect(result.result![0].cutoff_status).toBe('green');
        });
    });
});
