/**
 * Task Queue Tests
 *
 * Tests for the Celery client and task queue service.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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

        async lpush() {
            return 1;
        }

        async get() {
            return null;
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

    afterAll(async () => {
        await client.close();
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
        });
    });

    describe('getResult', () => {
        it('should return PENDING status for unknown tasks', async () => {
            const result = await client.getResult('unknown-task-id');

            expect(result).toBeDefined();
            expect(result?.status).toBe('PENDING');
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
    describe('getTaskStatus', () => {
        it('should return pending status for unknown tasks', async () => {
            const status = await TaskQueue.getTaskStatus('00000000-0000-0000-0000-000000000000');

            expect(status.status).toBe('pending');
        });
    });
});
