/**
 * Task Queue Routes
 *
 * API endpoints for checking task status and managing background tasks.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TaskQueue } from '../services/queue';
import { logSuccess, logFailure } from '../utils/logger';

// Request validation schemas
const taskIdParamSchema = z.object({
    taskId: z.string().uuid('Invalid task ID'),
});

interface TaskStatusResponse {
    success: boolean;
    data?: {
        taskId: string;
        status: 'pending' | 'running' | 'completed' | 'failed';
        result?: unknown;
        error?: string;
    };
    error?: string;
}

interface QueueHealthResponse {
    success: boolean;
    data?: {
        connected: boolean;
    };
}

export async function taskRoutes(app: FastifyInstance) {
    /**
     * GET /api/tasks/:taskId
     *
     * Get the status of a submitted task
     */
    app.get('/tasks/:taskId', async (
        request: FastifyRequest<{ Params: { taskId: string } }>,
        reply: FastifyReply
    ): Promise<TaskStatusResponse> => {
        try {
            const { taskId } = taskIdParamSchema.parse(request.params);

            const status = await TaskQueue.getTaskStatus(taskId);

            logSuccess(app, 'Task status retrieved', { taskId, status: status.status });

            return {
                success: true,
                data: status,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logFailure(app, 'Get task status', errorMessage, { taskId: request.params.taskId });

            reply.status(error instanceof z.ZodError ? 400 : 500);

            return {
                success: false,
                error: error instanceof z.ZodError
                    ? error.errors.map(e => e.message).join(', ')
                    : errorMessage,
            };
        }
    });

    /**
     * GET /api/tasks/health
     *
     * Check if the task queue (Redis) is connected
     */
    app.get('/tasks/health', async (
        _request: FastifyRequest,
        _reply: FastifyReply
    ): Promise<QueueHealthResponse> => {
        return {
            success: true,
            data: {
                connected: TaskQueue.isConnected(),
            },
        };
    });
}
