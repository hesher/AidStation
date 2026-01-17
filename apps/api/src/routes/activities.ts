/**
 * Activities Routes
 *
 * API endpoints for user activity uploads and performance analysis.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getOrCreateSessionUser,
  createActivity,
  getActivitiesByUser,
  getActivityById,
  deleteActivity,
  getUserPerformanceProfile,
  updateActivityStatus,
  updateActivity,
  updateUserPerformanceProfile,
} from '../db/repositories';
import { TaskQueue } from '../services/queue';
import { logSuccess, logFailure } from '../utils/logger';

// Request validation schemas
const uploadActivitySchema = z.object({
  name: z.string().optional(),
  activityDate: z.string().optional(),
  gpxContent: z.string().optional(),
  fitContent: z.string().optional(),
  fileType: z.enum(['gpx', 'fit']).optional(),
}).refine(
  (data) => data.gpxContent || data.fitContent,
  { message: 'Either gpxContent or fitContent is required' }
);

const uploadMultipleSchema = z.object({
  activities: z.array(z.object({
    name: z.string().optional(),
    activityDate: z.string().optional(),
    gpxContent: z.string().min(1),
  })).min(1, 'At least one activity is required'),
});

type UploadActivityBody = z.infer<typeof uploadActivitySchema>;
type UploadMultipleBody = z.infer<typeof uploadMultipleSchema>;

// Session cookie name
const SESSION_COOKIE = 'aidstation_session';

function getSessionId(request: FastifyRequest): string {
  const cookies = request.cookies || {};
  return cookies[SESSION_COOKIE] || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Response types
interface ActivityResponse {
  success: boolean;
  data?: {
    id: string;
    name?: string;
    activityDate?: string;
    distanceKm?: number;
    elevationGainM?: number;
    movingTimeSeconds?: number;
    averagePaceMinKm?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  };
  error?: string;
}

interface ActivitiesListResponse {
  success: boolean;
  data?: {
    activities: Array<{
      id: string;
      name?: string;
      activityDate?: string;
      distanceKm?: number;
      elevationGainM?: number;
      movingTimeSeconds?: number;
      averagePaceMinKm?: number;
      gradeAdjustedPaceMinKm?: number;
      status: string;
      createdAt: string;
    }>;
    total: number;
  };
  error?: string;
}

interface PerformanceProfileResponse {
  success: boolean;
  data?: {
    flatPaceMinKm?: number;
    climbingPaceMinKm?: number;
    descendingPaceMinKm?: number;
    fatigueFactor?: number;
    activitiesCount: number;
    lastUpdated?: string;
  };
  error?: string;
}

export async function activityRoutes(app: FastifyInstance) {
  /**
   * POST /api/activities
   *
   * Upload a single GPX or FIT activity
   */
  app.post('/activities', async (
    request: FastifyRequest<{ Body: UploadActivityBody }>,
    reply: FastifyReply
  ): Promise<ActivityResponse> => {
    try {
      const validatedBody = uploadActivitySchema.parse(request.body);
      const sessionId = getSessionId(request);

      // Get or create user
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      // Determine file type and content
      const isGpx = !!validatedBody.gpxContent;
      const isFit = !!validatedBody.fitContent;
      const fileType: 'gpx' | 'fit' = validatedBody.fileType || (isFit ? 'fit' : 'gpx');
      const fileContent = isGpx ? validatedBody.gpxContent! : validatedBody.fitContent!;

      // Parse GPX to extract basic info (only for GPX files)
      let gpxInfo: { name?: string; distanceKm?: number; elevationGainM?: number } = {};
      if (isGpx && validatedBody.gpxContent) {
        gpxInfo = parseGpxBasicInfo(validatedBody.gpxContent);
      }

      // Create activity record
      // For FIT files, we store the base64-encoded content in gpxContent field
      // (the Python worker will handle the conversion)
      const activity = await createActivity({
        userId,
        name: validatedBody.name || gpxInfo.name || 'Untitled Activity',
        activityDate: validatedBody.activityDate,
        gpxContent: fileContent,
        distanceKm: gpxInfo.distanceKm,
        elevationGainM: gpxInfo.elevationGainM,
        status: 'pending',
      });

      // Queue activity for Python worker analysis
      try {
        if (TaskQueue.isConnected()) {
          const submission = await TaskQueue.submitUserActivityAnalysis(
            activity.id,
            fileContent,
            fileType
          );

          if (submission.submitted) {
            // Update activity status to processing
            await updateActivityStatus(activity.id, 'processing', { taskId: submission.taskId });
            app.log.info({ activityId: activity.id, taskId: submission.taskId, fileType }, 'Activity queued for analysis');
          }
        } else {
          app.log.warn({ activityId: activity.id }, 'Redis not connected, skipping worker analysis');
        }
      } catch (queueError) {
        app.log.warn({ error: queueError, activityId: activity.id }, 'Failed to queue activity for analysis');
        // Don't fail the request - activity was still created
      }

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      logSuccess(app, 'Activity uploaded', { activityId: activity.id, name: activity.name });

      return {
        success: true,
        data: {
          id: activity.id,
          name: activity.name ?? undefined,
          activityDate: activity.activityDate?.toISOString(),
          distanceKm: activity.distanceKm ?? undefined,
          elevationGainM: activity.elevationGainM ?? undefined,
          movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
          averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
          status: 'pending',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Activity upload', errorMessage);

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
   * POST /api/activities/bulk
   *
   * Upload multiple GPX activities at once
   */
  app.post('/activities/bulk', async (
    request: FastifyRequest<{ Body: UploadMultipleBody }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; data?: { uploaded: number; activities: ActivityResponse['data'][] }; error?: string }> => {
    try {
      const validatedBody = uploadMultipleSchema.parse(request.body);
      const sessionId = getSessionId(request);

      // Get or create user
      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      const uploadedActivities: ActivityResponse['data'][] = [];

      for (const activityData of validatedBody.activities) {
        try {
          const gpxInfo = parseGpxBasicInfo(activityData.gpxContent);

          const activity = await createActivity({
            userId,
            name: activityData.name || gpxInfo.name || 'Untitled Activity',
            activityDate: activityData.activityDate,
            gpxContent: activityData.gpxContent,
            distanceKm: gpxInfo.distanceKm,
            elevationGainM: gpxInfo.elevationGainM,
            status: 'pending',
          });

          uploadedActivities.push({
            id: activity.id,
            name: activity.name ?? undefined,
            activityDate: activity.activityDate?.toISOString(),
            distanceKm: activity.distanceKm ?? undefined,
            elevationGainM: activity.elevationGainM ?? undefined,
            status: 'pending',
          });
        } catch (err) {
          app.log.warn({ error: err }, 'Failed to upload one activity in bulk');
        }
      }

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      logSuccess(app, 'Bulk activities uploaded', { count: uploadedActivities.length });

      return {
        success: true,
        data: {
          uploaded: uploadedActivities.length,
          activities: uploadedActivities,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Bulk activity upload', errorMessage);

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
   * GET /api/activities
   *
   * Get all activities for the current user
   */
  app.get('/activities', async (
    request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
    reply: FastifyReply
  ): Promise<ActivitiesListResponse> => {
    try {
      const sessionId = getSessionId(request);
      const { limit = '20', offset = '0' } = request.query;

      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      const result = await getActivitiesByUser(userId, {
        limit: Math.min(parseInt(limit, 10), 100),
        offset: Math.max(parseInt(offset, 10), 0),
      });

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      logSuccess(app, 'Activities listed', { count: result.activities.length, total: result.total });

      return {
        success: true,
        data: {
          activities: result.activities.map((a) => ({
            id: a.id,
            name: a.name ?? undefined,
            activityDate: a.activityDate?.toISOString(),
            distanceKm: a.distanceKm ?? undefined,
            elevationGainM: a.elevationGainM ?? undefined,
            movingTimeSeconds: a.movingTimeSeconds ?? undefined,
            averagePaceMinKm: a.averagePaceMinKm ?? undefined,
            gradeAdjustedPaceMinKm: a.gradeAdjustedPaceMinKm ?? undefined,
            status: 'completed', // TODO: Track actual status
            createdAt: a.createdAt.toISOString(),
          })),
          total: result.total,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'List activities', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/activities/:id
   *
   * Get a specific activity by ID
   */
  app.get('/activities/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<ActivityResponse> => {
    try {
      const { id } = request.params;

      const activity = await getActivityById(id);

      if (!activity) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      logSuccess(app, 'Activity retrieved', { activityId: activity.id });

      return {
        success: true,
        data: {
          id: activity.id,
          name: activity.name ?? undefined,
          activityDate: activity.activityDate?.toISOString(),
          distanceKm: activity.distanceKm ?? undefined,
          elevationGainM: activity.elevationGainM ?? undefined,
          movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
          averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
          status: 'completed',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get activity', errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/activities/:id/coordinates
   *
   * Get the coordinates for an activity (parsed from GPX)
   */
  app.get('/activities/:id/coordinates', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<{
    success: boolean;
    data?: {
      coordinates: Array<{ lat: number; lon: number; elevation?: number }>;
      count: number;
    };
    error?: string;
  }> => {
    try {
      const { id } = request.params;

      const activity = await getActivityById(id);

      if (!activity) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      if (!activity.gpxContent) {
        reply.status(404);
        return {
          success: false,
          error: 'No GPX data available for this activity',
        };
      }

      // Parse coordinates from GPX
      const coordinates = parseGpxCoordinates(activity.gpxContent);

      logSuccess(app, 'Activity coordinates retrieved', { activityId: id, count: coordinates.length });

      return {
        success: true,
        data: {
          coordinates,
          count: coordinates.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get activity coordinates', errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * DELETE /api/activities/:id
   *
   * Delete an activity
   */
  app.delete('/activities/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { id } = request.params;

      const deleted = await deleteActivity(id);

      if (!deleted) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      logSuccess(app, 'Activity deleted', { activityId: id });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Delete activity', errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * POST /api/activities/:id/sync
   *
   * Sync a single activity's analysis results from the worker
   * This is called automatically by the frontend or can be triggered manually
   */
  app.post('/activities/:id/sync', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<ActivityResponse> => {
    try {
      const { id } = request.params;
      const sessionId = getSessionId(request);

      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      const activity = await getActivityById(id);

      if (!activity) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      // Check if the activity has a pending task
      const analysisResults = activity.analysisResults as Record<string, unknown> | null;
      const taskId = analysisResults?.taskId as string | undefined;

      if (!taskId) {
        // No task ID - try to re-queue for analysis
        if (TaskQueue.isConnected() && activity.gpxContent) {
          const submission = await TaskQueue.submitUserActivityAnalysis(
            activity.id,
            activity.gpxContent
          );

          if (submission.submitted) {
            await updateActivityStatus(activity.id, 'processing', { taskId: submission.taskId });
            return {
              success: true,
              data: {
                id: activity.id,
                name: activity.name ?? undefined,
                activityDate: activity.activityDate?.toISOString(),
                distanceKm: activity.distanceKm ?? undefined,
                elevationGainM: activity.elevationGainM ?? undefined,
                movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
                averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
                status: 'processing',
              },
            };
          }
        }

        return {
          success: true,
          data: {
            id: activity.id,
            name: activity.name ?? undefined,
            activityDate: activity.activityDate?.toISOString(),
            distanceKm: activity.distanceKm ?? undefined,
            elevationGainM: activity.elevationGainM ?? undefined,
            movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
            averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
            status: 'pending',
          },
        };
      }

      // Get the result from Redis
      const taskStatus = await TaskQueue.getTaskStatus<{
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
          fatigue_curve: Array<{ distance_km: number; gap_min_km: number }>;
          fatigue_factor: number;
          segment_count: number;
        };
        error?: string;
      }>(taskId);

      if (taskStatus.status === 'completed' && taskStatus.result?.success && taskStatus.result?.analysis) {
        const analysis = taskStatus.result.analysis;

        // Update activity with analysis results
        await updateActivity(activity.id, {
          name: activity.name || analysis.name,
          distanceKm: analysis.total_distance_km,
          elevationGainM: analysis.elevation_gain_m,
          elevationLossM: analysis.elevation_loss_m,
          movingTimeSeconds: analysis.moving_time_seconds,
          totalTimeSeconds: analysis.total_time_seconds,
          averagePaceMinKm: analysis.average_pace_min_km,
          gradeAdjustedPaceMinKm: analysis.grade_adjusted_pace_min_km,
          analysisResults: {
            ...analysisResults,
            processingStatus: 'completed',
            paceByGradient: analysis.pace_by_gradient,
            fatigueCurve: analysis.fatigue_curve,
            fatigueFactor: analysis.fatigue_factor,
            segmentCount: analysis.segment_count,
            analyzedAt: new Date().toISOString(),
          },
        });

        // Recalculate the performance profile
        await recalculatePerformanceProfile(userId, app);

        const updatedActivity = await getActivityById(id);

        return {
          success: true,
          data: {
            id: updatedActivity!.id,
            name: updatedActivity!.name ?? undefined,
            activityDate: updatedActivity!.activityDate?.toISOString(),
            distanceKm: updatedActivity!.distanceKm ?? undefined,
            elevationGainM: updatedActivity!.elevationGainM ?? undefined,
            movingTimeSeconds: updatedActivity!.movingTimeSeconds ?? undefined,
            averagePaceMinKm: updatedActivity!.averagePaceMinKm ?? undefined,
            status: 'completed',
          },
        };
      } else if (taskStatus.status === 'failed') {
        await updateActivityStatus(activity.id, 'failed', { error: taskStatus.error });

        return {
          success: true,
          data: {
            id: activity.id,
            name: activity.name ?? undefined,
            activityDate: activity.activityDate?.toISOString(),
            distanceKm: activity.distanceKm ?? undefined,
            elevationGainM: activity.elevationGainM ?? undefined,
            movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
            averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
            status: 'failed',
          },
        };
      }

      // Still processing
      return {
        success: true,
        data: {
          id: activity.id,
          name: activity.name ?? undefined,
          activityDate: activity.activityDate?.toISOString(),
          distanceKm: activity.distanceKm ?? undefined,
          elevationGainM: activity.elevationGainM ?? undefined,
          movingTimeSeconds: activity.movingTimeSeconds ?? undefined,
          averagePaceMinKm: activity.averagePaceMinKm ?? undefined,
          status: 'processing',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Sync activity', errorMessage, { id: request.params.id });

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * POST /api/activities/sync-all
   *
   * Sync all pending activities for the current user
   * and recalculate performance profile
   */
  app.post('/activities/sync-all', async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ success: boolean; data?: { synced: number; updated: number }; error?: string }> => {
    try {
      const sessionId = getSessionId(request);

      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      // Get all activities
      const result = await getActivitiesByUser(userId, { limit: 1000, offset: 0 });
      let synced = 0;
      let updated = 0;

      for (const activity of result.activities) {
        const analysisResults = activity.analysisResults as Record<string, unknown> | null;
        const taskId = analysisResults?.taskId as string | undefined;
        const processingStatus = analysisResults?.processingStatus as string | undefined;

        // Skip already completed activities
        if (processingStatus === 'completed') {
          continue;
        }

        synced++;

        if (!taskId) {
          // No task ID - queue for analysis
          if (TaskQueue.isConnected() && activity.gpxContent) {
            const submission = await TaskQueue.submitUserActivityAnalysis(
              activity.id,
              activity.gpxContent
            );

            if (submission.submitted) {
              await updateActivityStatus(activity.id, 'processing', { taskId: submission.taskId });
            }
          }
          continue;
        }

        // Get the result from Redis
        const taskStatus = await TaskQueue.getTaskStatus<{
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
            fatigue_curve: Array<{ distance_km: number; gap_min_km: number }>;
            fatigue_factor: number;
            segment_count: number;
          };
          error?: string;
        }>(taskId);

        if (taskStatus.status === 'completed' && taskStatus.result?.success && taskStatus.result?.analysis) {
          const analysis = taskStatus.result.analysis;

          // Update activity with analysis results
          await updateActivity(activity.id, {
            name: activity.name || analysis.name,
            distanceKm: analysis.total_distance_km,
            elevationGainM: analysis.elevation_gain_m,
            elevationLossM: analysis.elevation_loss_m,
            movingTimeSeconds: analysis.moving_time_seconds,
            totalTimeSeconds: analysis.total_time_seconds,
            averagePaceMinKm: analysis.average_pace_min_km,
            gradeAdjustedPaceMinKm: analysis.grade_adjusted_pace_min_km,
            analysisResults: {
              ...analysisResults,
              processingStatus: 'completed',
              paceByGradient: analysis.pace_by_gradient,
              fatigueCurve: analysis.fatigue_curve,
              fatigueFactor: analysis.fatigue_factor,
              segmentCount: analysis.segment_count,
              analyzedAt: new Date().toISOString(),
            },
          });

          updated++;
        } else if (taskStatus.status === 'failed') {
          await updateActivityStatus(activity.id, 'failed', { error: taskStatus.error });
        }
      }

      // Recalculate performance profile if any activities were updated
      if (updated > 0) {
        await recalculatePerformanceProfile(userId, app);
      }

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      logSuccess(app, 'Activities synced', { synced, updated });

      return {
        success: true,
        data: { synced, updated },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Sync all activities', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  /**
   * GET /api/performance/profile
   *
   * Get the user's performance profile (aggregated from activities)
   */
  app.get('/performance/profile', async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<PerformanceProfileResponse> => {
    try {
      const sessionId = getSessionId(request);

      let userId: string;
      try {
        userId = await getOrCreateSessionUser(sessionId);
      } catch (dbError) {
        app.log.warn({ error: dbError }, 'Database not available');
        reply.status(503);
        return {
          success: false,
          error: 'Database not available',
        };
      }

      const profile = await getUserPerformanceProfile(userId);
      const activities = await getActivitiesByUser(userId, { limit: 1, offset: 0 });

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

      if (!profile) {
        return {
          success: true,
          data: {
            activitiesCount: activities.total,
          },
        };
      }

      logSuccess(app, 'Performance profile retrieved', { activitiesCount: activities.total });

      return {
        success: true,
        data: {
          flatPaceMinKm: profile.flatPaceMinKm ?? undefined,
          climbingPaceMinKm: profile.climbingPaceMinKm ?? undefined,
          descendingPaceMinKm: profile.descendingPaceMinKm ?? undefined,
          fatigueFactor: profile.fatigueFactor ?? undefined,
          activitiesCount: activities.total,
          lastUpdated: profile.updatedAt?.toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get performance profile', errorMessage);

      reply.status(500);

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
}

/**
 * Parse basic info from GPX content (lightweight parsing)
 */
function parseGpxBasicInfo(gpxContent: string): {
  name?: string;
  distanceKm?: number;
  elevationGainM?: number;
} {
  try {
    // Extract name from GPX
    const nameMatch = gpxContent.match(/<name>([^<]+)<\/name>/);
    const name = nameMatch ? nameMatch[1] : undefined;

    // For accurate distance and elevation, we'd use the Python worker
    // This is just a placeholder for immediate feedback
    return { name };
  } catch {
    return {};
  }
}

/**
 * Parse coordinates from GPX content
 */
function parseGpxCoordinates(gpxContent: string): Array<{ lat: number; lon: number; elevation?: number }> {
  try {
    const coordinates: Array<{ lat: number; lon: number; elevation?: number }> = [];

    // Match all trkpt elements with lat/lon attributes
    const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([^]*?)<\/trkpt>/g;
    let match;

    while ((match = trkptRegex.exec(gpxContent)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const content = match[3];

      // Extract elevation if present
      const eleMatch = content.match(/<ele>([^<]+)<\/ele>/);
      const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;

      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push({ lat, lon, elevation });
      }
    }

    // If no trkpt found, try rtept (route points)
    if (coordinates.length === 0) {
      const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([^]*?)<\/rtept>/g;
      while ((match = rteptRegex.exec(gpxContent)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const content = match[3];
        const eleMatch = content.match(/<ele>([^<]+)<\/ele>/);
        const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;

        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push({ lat, lon, elevation });
        }
      }
    }

    // If still no points, try wpt (waypoints)
    if (coordinates.length === 0) {
      const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([^]*?)<\/wpt>/g;
      while ((match = wptRegex.exec(gpxContent)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const content = match[3];
        const eleMatch = content.match(/<ele>([^<]+)<\/ele>/);
        const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;

        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push({ lat, lon, elevation });
        }
      }
    }

    return coordinates;
  } catch {
    return [];
  }
}

/**
 * Recalculate a user's performance profile from their analyzed activities
 */
async function recalculatePerformanceProfile(
  userId: string,
  app: FastifyInstance
): Promise<void> {
  try {
    // Get all activities with analysis results
    const result = await getActivitiesByUser(userId, { limit: 1000, offset: 0 });

    const analyzedActivities = result.activities.filter((a) => {
      const analysisResults = a.analysisResults as Record<string, unknown> | null;
      return analysisResults?.processingStatus === 'completed' && analysisResults?.paceByGradient;
    });

    if (analyzedActivities.length === 0) {
      app.log.info({ userId }, 'No analyzed activities for performance profile calculation');
      return;
    }

    // Calculate weighted averages for each gradient category
    const gradientPaces: Record<string, { sum: number; count: number }> = {
      flat: { sum: 0, count: 0 },
      gentle_uphill: { sum: 0, count: 0 },
      uphill: { sum: 0, count: 0 },
      steep_uphill: { sum: 0, count: 0 },
      gentle_downhill: { sum: 0, count: 0 },
      downhill: { sum: 0, count: 0 },
      steep_downhill: { sum: 0, count: 0 },
    };

    let totalFatigueFactor = 0;
    let fatigueCount = 0;

    for (const activity of analyzedActivities) {
      const analysisResults = activity.analysisResults as Record<string, unknown>;
      const paceByGradient = analysisResults.paceByGradient as Record<string, number | null>;
      const fatigueFactor = analysisResults.fatigueFactor as number | undefined;

      // Calculate recency weight
      const activityDate = activity.activityDate || activity.createdAt;
      const daysAgo = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
      const weight = Math.exp(-daysAgo / 90); // 90-day half-life

      for (const [gradient, pace] of Object.entries(paceByGradient)) {
        if (pace !== null && pace !== undefined && gradientPaces[gradient]) {
          gradientPaces[gradient].sum += pace * weight;
          gradientPaces[gradient].count += weight;
        }
      }

      if (fatigueFactor !== undefined && fatigueFactor !== null) {
        totalFatigueFactor += fatigueFactor * weight;
        fatigueCount += weight;
      }
    }

    // Calculate final averages
    const flatPace = gradientPaces.flat.count > 0
      ? gradientPaces.flat.sum / gradientPaces.flat.count
      : undefined;

    // Combine uphill categories for climbing pace
    const climbingSum = gradientPaces.gentle_uphill.sum + gradientPaces.uphill.sum + gradientPaces.steep_uphill.sum;
    const climbingCount = gradientPaces.gentle_uphill.count + gradientPaces.uphill.count + gradientPaces.steep_uphill.count;
    const climbingPace = climbingCount > 0 ? climbingSum / climbingCount : undefined;

    // Combine downhill categories for descending pace
    const descendingSum = gradientPaces.gentle_downhill.sum + gradientPaces.downhill.sum + gradientPaces.steep_downhill.sum;
    const descendingCount = gradientPaces.gentle_downhill.count + gradientPaces.downhill.count + gradientPaces.steep_downhill.count;
    const descendingPace = descendingCount > 0 ? descendingSum / descendingCount : undefined;

    const avgFatigueFactor = fatigueCount > 0 ? totalFatigueFactor / fatigueCount : undefined;

    // Update performance profile
    await updateUserPerformanceProfile(userId, {
      flatPaceMinKm: flatPace,
      climbingPaceMinKm: climbingPace,
      descendingPaceMinKm: descendingPace,
      fatigueFactor: avgFatigueFactor,
      profileData: {
        gradientPaces: Object.fromEntries(
          Object.entries(gradientPaces).map(([k, v]) => [k, v.count > 0 ? v.sum / v.count : null])
        ),
        activitiesAnalyzed: analyzedActivities.length,
        lastRecalculatedAt: new Date().toISOString(),
      },
    });

    app.log.info({
      userId,
      activitiesAnalyzed: analyzedActivities.length,
      flatPace,
      climbingPace,
      descendingPace,
      avgFatigueFactor,
    }, 'Performance profile recalculated');
  } catch (error) {
    app.log.error({ error, userId }, 'Failed to recalculate performance profile');
    throw error;
  }
}
