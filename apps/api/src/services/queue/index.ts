/**
 * Queue Service
 *
 * Provides communication between Node.js and Python Celery workers via Redis.
 * Uses the Celery protocol to submit tasks and retrieve results.
 */

export { CeleryClient, celeryClient } from './celery-client';
export type { CeleryTaskResult, CeleryClientOptions } from './celery-client';
export { TaskQueue, GPX_TASKS, PREDICTION_TASKS } from './task-queue';
export type { TaskSubmission, TaskStatus } from './task-queue';
