/**
 * Celery Client
 *
 * A Node.js client for communicating with Celery workers via Redis.
 * This implements the Celery protocol for task submission and result retrieval.
 *
 * Celery Protocol:
 * - Tasks are submitted by publishing a message to a Redis queue (default: 'celery')
 * - Results are stored in Redis with key: celery-task-meta-<task_id>
 *
 * Message format:
 * {
 *   "id": "<uuid>",
 *   "task": "<task_name>",
 *   "args": [...],
 *   "kwargs": {...},
 *   "retries": 0,
 *   "eta": null
 * }
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';

export interface CeleryClientOptions {
    redisUrl?: string;
    defaultQueue?: string;
    resultExpireSeconds?: number;
}

export interface CeleryTaskResult<T = unknown> {
    taskId: string;
    status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'RETRY' | 'REVOKED';
    result?: T;
    error?: string;
    traceback?: string;
}

interface CeleryMessage {
    id: string;
    task: string;
    args: unknown[];
    kwargs: Record<string, unknown>;
    retries: number;
    eta: string | null;
    expires: string | null;
    callbacks: null;
    errbacks: null;
    timelimit: [number | null, number | null];
    taskset: null;
    chord: null;
    group: null;
    root_id: string;
    parent_id: null;
    reply_to: string;
}

interface CeleryResultMessage {
    task_id: string;
    status: string;
    result: unknown;
    traceback?: string;
    children?: unknown[];
}

export class CeleryClient {
    private redis: Redis;
    private subscriberRedis: Redis;
    private defaultQueue: string;
    private resultExpireSeconds: number;
    private connected: boolean = false;

    constructor(options: CeleryClientOptions = {}) {
        const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379/0';
        this.defaultQueue = options.defaultQueue || 'celery';
        this.resultExpireSeconds = options.resultExpireSeconds || 86400; // 24 hours

        this.redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000),
        });

        this.subscriberRedis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000),
        });

        this.redis.on('connect', () => {
            this.connected = true;
        });

        this.redis.on('error', (err) => {
            console.error('[CeleryClient] Redis error:', err.message);
            this.connected = false;
        });
    }

    /**
     * Check if Redis is connected
     */
    isConnected(): boolean {
        return this.connected && this.redis.status === 'ready';
    }

    /**
     * Submit a task to Celery
     *
     * @param taskName - The name of the Celery task (e.g., 'analyze_gpx_course')
     * @param args - Positional arguments for the task
     * @param kwargs - Keyword arguments for the task
     * @param options - Additional options (queue, eta, expires)
     * @returns The task ID
     */
    async submitTask(
        taskName: string,
        args: unknown[] = [],
        kwargs: Record<string, unknown> = {},
        options: { queue?: string; eta?: Date; expires?: Date } = {}
    ): Promise<string> {
        const taskId = randomUUID();
        const queue = options.queue || this.defaultQueue;

        const message: CeleryMessage = {
            id: taskId,
            task: taskName,
            args,
            kwargs,
            retries: 0,
            eta: options.eta ? options.eta.toISOString() : null,
            expires: options.expires ? options.expires.toISOString() : null,
            callbacks: null,
            errbacks: null,
            timelimit: [null, null],
            taskset: null,
            chord: null,
            group: null,
            root_id: taskId,
            parent_id: null,
            reply_to: taskId,
        };

        // Celery expects messages wrapped with content_type and properties
        const wrappedMessage = {
            body: Buffer.from(JSON.stringify([args, kwargs, {}])).toString('base64'),
            'content-encoding': 'utf-8',
            'content-type': 'application/json',
            headers: {
                lang: 'js',
                task: taskName,
                id: taskId,
                root_id: taskId,
                parent_id: null,
                group: null,
                argsrepr: JSON.stringify(args),
                kwargsrepr: JSON.stringify(kwargs),
                retries: 0,
                eta: message.eta,
                expires: message.expires,
            },
            properties: {
                correlation_id: taskId,
                reply_to: taskId,
                delivery_mode: 2,
                delivery_tag: taskId,
                delivery_info: {
                    exchange: '',
                    routing_key: queue,
                },
                priority: 0,
                body_encoding: 'base64',
            },
        };

        // Push to Redis list (Celery uses LPUSH)
        await this.redis.lpush(queue, JSON.stringify(wrappedMessage));

        return taskId;
    }

    /**
     * Get the result of a task
     *
     * @param taskId - The task ID
     * @returns The task result or null if not ready
     */
    async getResult<T = unknown>(taskId: string): Promise<CeleryTaskResult<T> | null> {
        const key = `celery-task-meta-${taskId}`;
        const result = await this.redis.get(key);

        if (!result) {
            return {
                taskId,
                status: 'PENDING',
            };
        }

        try {
            const parsed: CeleryResultMessage = JSON.parse(result);

            if (parsed.status === 'FAILURE') {
                return {
                    taskId,
                    status: 'FAILURE',
                    error: typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result),
                    traceback: parsed.traceback,
                };
            }

            return {
                taskId,
                status: parsed.status as CeleryTaskResult<T>['status'],
                result: parsed.result as T,
            };
        } catch (e) {
            console.error('[CeleryClient] Failed to parse result:', e);
            return null;
        }
    }

    /**
     * Wait for a task to complete with polling
     *
     * @param taskId - The task ID
     * @param timeoutMs - Maximum time to wait (default: 30 seconds)
     * @param pollIntervalMs - Polling interval (default: 500ms)
     * @returns The task result
     */
    async waitForResult<T = unknown>(
        taskId: string,
        timeoutMs: number = 30000,
        pollIntervalMs: number = 500
    ): Promise<CeleryTaskResult<T>> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const result = await this.getResult<T>(taskId);

            if (result && result.status !== 'PENDING' && result.status !== 'STARTED') {
                return result;
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        return {
            taskId,
            status: 'PENDING',
            error: `Task timed out after ${timeoutMs}ms`,
        };
    }

    /**
     * Submit a task and wait for the result
     *
     * @param taskName - The name of the Celery task
     * @param args - Positional arguments for the task
     * @param kwargs - Keyword arguments for the task
     * @param timeoutMs - Maximum time to wait (default: 30 seconds)
     * @returns The task result
     */
    async submitAndWait<T = unknown>(
        taskName: string,
        args: unknown[] = [],
        kwargs: Record<string, unknown> = {},
        timeoutMs: number = 30000
    ): Promise<CeleryTaskResult<T>> {
        const taskId = await this.submitTask(taskName, args, kwargs);
        return this.waitForResult<T>(taskId, timeoutMs);
    }

    /**
     * Revoke a task (attempt to cancel it)
     *
     * @param taskId - The task ID to revoke
     */
    async revokeTask(taskId: string): Promise<void> {
        // Celery uses a revoked set to track revoked tasks
        await this.redis.sadd('celery-revoked', taskId);
    }

    /**
     * Clean up and close connections
     */
    async close(): Promise<void> {
        await this.redis.quit();
        await this.subscriberRedis.quit();
        this.connected = false;
    }
}

// Singleton instance
export const celeryClient = new CeleryClient();
