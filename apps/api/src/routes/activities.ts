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
   * GET /api/activities/:id/terrain-segments
   *
   * Get terrain segment breakdown for an activity
   * Breaks down the activity into climb/descent/flat sections with 5km blocks for flat/descent
   */
  app.get('/activities/:id/terrain-segments', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<{
    success: boolean;
    data?: {
      activityId: string;
      totalDistanceKm: number;
      totalElevationGainM: number;
      totalElevationLossM: number;
      totalTimeSeconds: number;
      segments: Array<{
        segmentIndex: number;
        terrainType: string;
        gradeCategory: string;
        startDistanceKm: number;
        endDistanceKm: number;
        distanceKm: number;
        elevationStartM: number;
        elevationEndM: number;
        totalAscentM: number;
        totalDescentM: number;
        averageGradePercent: number;
        timeSeconds: number;
        paceMinKm: number;
        gradeAdjustedPaceMinKm: number;
      }>;
      summary: {
        climb: {
          totalDistanceKm: number;
          totalTimeSeconds: number;
          totalElevationM: number;
          averagePaceMinKm: number;
          segmentCount: number;
        };
        descent: {
          totalDistanceKm: number;
          totalTimeSeconds: number;
          totalElevationM: number;
          averagePaceMinKm: number;
          segmentCount: number;
        };
        flat: {
          totalDistanceKm: number;
          totalTimeSeconds: number;
          averagePaceMinKm: number;
          segmentCount: number;
        };
        totalSegments: number;
      };
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

      // Parse and analyze terrain segments from GPX
      const segments = parseTerrainSegments(activity.gpxContent, id);

      logSuccess(app, 'Activity terrain segments retrieved', { activityId: id, segmentCount: segments.segments.length });

      return {
        success: true,
        data: segments,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Get activity terrain segments', errorMessage, { id: request.params.id });

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

      // Get the activity first to get the user ID for recalculating the profile
      const activity = await getActivityById(id);

      if (!activity) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      const userId = activity.userId;

      const deleted = await deleteActivity(id);

      if (!deleted) {
        reply.status(404);
        return {
          success: false,
          error: 'Activity not found',
        };
      }

      // Recalculate performance profile after deletion
      if (userId) {
        try {
          await recalculatePerformanceProfile(userId, app);
          app.log.info({ userId, activityId: id }, 'Performance profile recalculated after activity deletion');
        } catch (recalcError) {
          app.log.warn({ error: recalcError, userId }, 'Failed to recalculate performance profile after deletion');
          // Don't fail the deletion if profile recalculation fails
        }
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
   * POST /api/activities/:id/reanalyze
   *
   * Force re-analysis of an activity (useful when analysis code changes)
   */
  app.post('/activities/:id/reanalyze', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<ActivityResponse> => {
    try {
      const { id } = request.params;
      const sessionId = getSessionId(request);

      // Verify user session exists (but we don't need the userId for this operation)
      try {
        await getOrCreateSessionUser(sessionId);
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

      if (!activity.gpxContent) {
        reply.status(400);
        return {
          success: false,
          error: 'No GPX content available for this activity',
        };
      }

      // Force re-queue for analysis
      if (TaskQueue.isConnected()) {
        const submission = await TaskQueue.submitUserActivityAnalysis(
          activity.id,
          activity.gpxContent
        );

        if (submission.submitted) {
          await updateActivityStatus(activity.id, 'processing', { taskId: submission.taskId });

          app.log.info({ activityId: activity.id, taskId: submission.taskId }, 'Activity queued for re-analysis');

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

      reply.status(503);
      return {
        success: false,
        error: 'Task queue not available',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logFailure(app, 'Reanalyze activity', errorMessage, { id: request.params.id });

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
          pace_by_distance_5k?: Array<{
            segment_start_km: number;
            segment_end_km: number;
            actual_pace_min_km: number;
            grade_adjusted_pace_min_km: number;
            elevation_gain_m: number;
            elevation_loss_m: number;
            distance_km: number;
          }>;
          normalized_pace_profile?: {
            pace_by_progress_pct: Record<string, number>;
            gap_by_progress_pct: Record<string, number>;
            baseline_pace_min_km: number;
            baseline_gap_min_km: number;
            activity_distance_km: number;
          };
        };
        error?: string;
      }>(taskId);

      if (taskStatus.status === 'completed' && taskStatus.result?.success && taskStatus.result?.analysis) {
        const analysis = taskStatus.result.analysis;

        // Update activity with analysis results
        await updateActivity(activity.id, {
          name: activity.name || analysis.name,
          // Update activityDate from analysis if not already set
          activityDate: analysis.activity_date || activity.activityDate?.toISOString(),
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
            pace_by_distance_5k?: Array<{
              segment_start_km: number;
              segment_end_km: number;
              actual_pace_min_km: number;
              grade_adjusted_pace_min_km: number;
              elevation_gain_m: number;
              elevation_loss_m: number;
              distance_km: number;
            }>;
            normalized_pace_profile?: {
              pace_by_progress_pct: Record<string, number>;
              gap_by_progress_pct: Record<string, number>;
              baseline_pace_min_km: number;
              baseline_gap_min_km: number;
              activity_distance_km: number;
            };
          };
          error?: string;
        }>(taskId);

        if (taskStatus.status === 'completed' && taskStatus.result?.success && taskStatus.result?.analysis) {
          const analysis = taskStatus.result.analysis;

          // Update activity with analysis results
          await updateActivity(activity.id, {
            name: activity.name || analysis.name,
            // Update activityDate from analysis if not already set
            activityDate: analysis.activity_date || activity.activityDate?.toISOString(),
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
              // NEW: Store segment-based pace data for improved predictions
              paceByDistance5k: analysis.pace_by_distance_5k,
              normalizedPaceProfile: analysis.normalized_pace_profile,
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
 * Terrain segment types
 */
interface TerrainSegmentData {
  activityId: string;
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalElevationLossM: number;
  totalTimeSeconds: number;
  segments: Array<{
    segmentIndex: number;
    terrainType: string;
    gradeCategory: string;
    startDistanceKm: number;
    endDistanceKm: number;
    distanceKm: number;
    elevationStartM: number;
    elevationEndM: number;
    totalAscentM: number;
    totalDescentM: number;
    averageGradePercent: number;
    timeSeconds: number;
    paceMinKm: number;
    gradeAdjustedPaceMinKm: number;
  }>;
  summary: {
    climb: {
      totalDistanceKm: number;
      totalTimeSeconds: number;
      totalElevationM: number;
      averagePaceMinKm: number;
      segmentCount: number;
    };
    descent: {
      totalDistanceKm: number;
      totalTimeSeconds: number;
      totalElevationM: number;
      averagePaceMinKm: number;
      segmentCount: number;
    };
    flat: {
      totalDistanceKm: number;
      totalTimeSeconds: number;
      averagePaceMinKm: number;
      segmentCount: number;
    };
    totalSegments: number;
  };
}

/**
 * Parse terrain segments from GPX content.
 * Breaks down activity into climb/descent/flat sections with 5km blocks for flat/descent.
 */
function parseTerrainSegments(gpxContent: string, activityId: string): TerrainSegmentData {
  // Parse coordinates with elevation and time
  const points = parseGpxPointsWithTime(gpxContent);

  if (points.length < 10) {
    throw new Error('Not enough GPS points for terrain analysis');
  }

  // Configuration
  const CLIMB_THRESHOLD = 3.0; // >= 3% grade is a climb
  const DESCENT_THRESHOLD = -3.0; // <= -3% grade is a descent
  const MAX_SEGMENT_LENGTH_KM = 5.0; // Split flat/descent into 5km blocks
  const MIN_SEGMENT_LENGTH_KM = 0.3; // Minimum segment to avoid fragments
  const WINDOW_SIZE_M = 200; // Window for detecting terrain type
  const MIN_CLIMB_ELEVATION_M = 50; // Minimum elevation gain for a "significant" climb
  const MIN_DESCENT_ELEVATION_M = 100; // Minimum elevation loss for a "significant" descent

  // Calculate cumulative distance and smoothed elevation
  let cumulativeDistance = 0;
  const processedPoints: Array<{
    lat: number;
    lon: number;
    elevation: number;
    time: Date | null;
    distanceM: number;
  }> = [];

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      cumulativeDistance += haversineDistance(
        points[i - 1].lat,
        points[i - 1].lon,
        points[i].lat,
        points[i].lon
      );
    }

    processedPoints.push({
      ...points[i],
      distanceM: cumulativeDistance,
    });
  }

  // Apply Kalman smoothing to elevation
  const elevations = processedPoints.map(p => p.elevation);
  const smoothedElevations = kalmanSmoothElevation(elevations);
  processedPoints.forEach((p, i) => {
    p.elevation = smoothedElevations[i];
  });

  const totalDistance = processedPoints[processedPoints.length - 1].distanceM;

  // Detect terrain changes
  type TerrainType = 'climb' | 'descent' | 'flat';
  interface RawSegment {
    startIdx: number;
    endIdx: number;
    terrainType: TerrainType;
  }

  function getTerrainType(gradePercent: number): TerrainType {
    if (gradePercent >= CLIMB_THRESHOLD) return 'climb';
    if (gradePercent <= DESCENT_THRESHOLD) return 'descent';
    return 'flat';
  }

  function findPointAtDistance(targetM: number): number {
    for (let i = 0; i < processedPoints.length; i++) {
      if (processedPoints[i].distanceM >= targetM) return i;
    }
    return processedPoints.length - 1;
  }

  // Detect terrain changes using sliding window
  const rawSegments: RawSegment[] = [];
  let currentStartIdx = 0;
  let currentTerrain: TerrainType | null = null;
  let currentDistanceM = 0;

  while (currentDistanceM < totalDistance) {
    const windowEnd = Math.min(currentDistanceM + WINDOW_SIZE_M, totalDistance);
    const startIdx = findPointAtDistance(currentDistanceM);
    const endIdx = findPointAtDistance(windowEnd);

    if (startIdx >= endIdx) {
      currentDistanceM += WINDOW_SIZE_M;
      continue;
    }

    const startPoint = processedPoints[startIdx];
    const endPoint = processedPoints[endIdx];
    const segDistanceM = endPoint.distanceM - startPoint.distanceM;

    if (segDistanceM <= 0) {
      currentDistanceM += WINDOW_SIZE_M;
      continue;
    }

    const elevChange = endPoint.elevation - startPoint.elevation;
    const gradePercent = (elevChange / segDistanceM) * 100;
    const newTerrain = getTerrainType(gradePercent);

    if (currentTerrain === null) {
      currentTerrain = newTerrain;
      currentStartIdx = startIdx;
    } else if (newTerrain !== currentTerrain) {
      rawSegments.push({
        startIdx: currentStartIdx,
        endIdx: startIdx,
        terrainType: currentTerrain,
      });
      currentTerrain = newTerrain;
      currentStartIdx = startIdx;
    }

    currentDistanceM += WINDOW_SIZE_M;
  }

  // Add final segment
  if (currentTerrain !== null && currentStartIdx < processedPoints.length - 1) {
    rawSegments.push({
      startIdx: currentStartIdx,
      endIdx: processedPoints.length - 1,
      terrainType: currentTerrain,
    });
  }

  // Merge short segments
  const shortMergedSegments: RawSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    const startDist = processedPoints[seg.startIdx].distanceM;
    const endDist = processedPoints[seg.endIdx].distanceM;
    const lengthKm = (endDist - startDist) / 1000;

    if (lengthKm < MIN_SEGMENT_LENGTH_KM && i + 1 < rawSegments.length) {
      rawSegments[i + 1].startIdx = seg.startIdx;
    } else if (lengthKm < MIN_SEGMENT_LENGTH_KM && shortMergedSegments.length > 0) {
      shortMergedSegments[shortMergedSegments.length - 1].endIdx = seg.endIdx;
    } else {
      shortMergedSegments.push(seg);
    }
  }

  // Split long flat/descent segments into 5km blocks
  const finalSegments: RawSegment[] = [];
  for (const seg of shortMergedSegments) {
    const startDistM = processedPoints[seg.startIdx].distanceM;
    const endDistM = processedPoints[seg.endIdx].distanceM;
    const lengthKm = (endDistM - startDistM) / 1000;

    if (seg.terrainType === 'climb' || lengthKm <= MAX_SEGMENT_LENGTH_KM) {
      finalSegments.push(seg);
    } else {
      // Split into 5km blocks
      let blockStartIdx = seg.startIdx;
      let blockStartM = startDistM;

      while (blockStartM < endDistM) {
        const blockEndM = Math.min(blockStartM + MAX_SEGMENT_LENGTH_KM * 1000, endDistM);
        const blockEndIdx = findPointAtDistance(blockEndM);

        finalSegments.push({
          startIdx: blockStartIdx,
          endIdx: blockEndIdx,
          terrainType: seg.terrainType,
        });

        blockStartIdx = blockEndIdx;
        blockStartM = blockEndM;
      }
    }
  }

  // Calculate Minetti cost for GAP
  function calculateMinettiCost(gradient: number): number {
    const i = gradient;
    return 155.4 * Math.pow(i, 5) - 30.4 * Math.pow(i, 4) - 43.3 * Math.pow(i, 3) + 46.3 * Math.pow(i, 2) + 19.5 * i + 3.6;
  }

  // Consolidate small climbs and descents into "rolling hills" sections
  // Only show climbs with > MIN_CLIMB_ELEVATION_M total ascent
  // Only show descents with > MIN_DESCENT_ELEVATION_M total descent
  // Merge smaller segments into "rolling_hills" terrain type
  interface ConsolidatedSegment {
    startIdx: number;
    endIdx: number;
    terrainType: TerrainType | 'rolling_hills';
    totalElevationGain: number;
    totalElevationLoss: number;
  }

  // Calculate actual ascent and descent within a segment (by iterating through points)
  function calculateSegmentElevationDetails(startIdx: number, endIdx: number): { gain: number; loss: number } {
    let gain = 0;
    let loss = 0;
    for (let k = startIdx; k < endIdx; k++) {
      const diff = processedPoints[k + 1].elevation - processedPoints[k].elevation;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    return { gain, loss };
  }

  function calculateSegmentElevation(seg: RawSegment): { gain: number; loss: number } {
    return calculateSegmentElevationDetails(seg.startIdx, seg.endIdx);
  }

  const consolidatedSegments: ConsolidatedSegment[] = [];
  let i = 0;

  while (i < finalSegments.length) {
    const seg = finalSegments[i];
    const { gain, loss } = calculateSegmentElevation(seg);

    // Check if this segment meets the significance threshold
    const isSignificantClimb = seg.terrainType === 'climb' && gain >= MIN_CLIMB_ELEVATION_M;
    const isSignificantDescent = seg.terrainType === 'descent' && loss >= MIN_DESCENT_ELEVATION_M;
    const isFlat = seg.terrainType === 'flat';

    if (isSignificantClimb || isSignificantDescent || isFlat) {
      // Keep as-is
      consolidatedSegments.push({
        startIdx: seg.startIdx,
        endIdx: seg.endIdx,
        terrainType: seg.terrainType,
        totalElevationGain: gain,
        totalElevationLoss: loss,
      });
      i++;
    } else {
      // This is a small climb or descent - try to consolidate with subsequent small segments
      const rollingStartIdx = seg.startIdx;
      let rollingEndIdx = seg.endIdx;
      let rollingElevGain = gain;
      let rollingElevLoss = loss;

      // Look ahead to consolidate consecutive small segments
      let j = i + 1;
      while (j < finalSegments.length) {
        const nextSeg = finalSegments[j];
        const nextElev = calculateSegmentElevation(nextSeg);

        const nextIsSignificantClimb = nextSeg.terrainType === 'climb' && nextElev.gain >= MIN_CLIMB_ELEVATION_M;
        const nextIsSignificantDescent = nextSeg.terrainType === 'descent' && nextElev.loss >= MIN_DESCENT_ELEVATION_M;
        const nextIsFlat = nextSeg.terrainType === 'flat';

        if (nextIsSignificantClimb || nextIsSignificantDescent || nextIsFlat) {
          // Next segment is significant or flat, stop consolidating
          break;
        }

        // Consolidate this small segment
        rollingEndIdx = nextSeg.endIdx;
        rollingElevGain += nextElev.gain;
        rollingElevLoss += nextElev.loss;
        j++;
      }

      // Create a rolling hills segment
      consolidatedSegments.push({
        startIdx: rollingStartIdx,
        endIdx: rollingEndIdx,
        terrainType: 'rolling_hills',
        totalElevationGain: rollingElevGain,
        totalElevationLoss: rollingElevLoss,
      });

      i = j;
    }
  }

  // SECOND PASS: Merge consecutive flat and rolling_hills segments < 1km
  const MIN_FLAT_ROLLING_LENGTH_KM = 1.0;
  const finalConsolidatedSegments: ConsolidatedSegment[] = [];
  
  for (let idx = 0; idx < consolidatedSegments.length; idx++) {
    const seg = consolidatedSegments[idx];
    const startDistM = processedPoints[seg.startIdx].distanceM;
    const endDistM = processedPoints[seg.endIdx].distanceM;
    const lengthKm = (endDistM - startDistM) / 1000;
    
    // Check if this is a short flat or rolling segment that should be merged
    const isShortFlatOrRolling = (seg.terrainType === 'flat' || seg.terrainType === 'rolling_hills') && lengthKm < MIN_FLAT_ROLLING_LENGTH_KM;
    
    if (isShortFlatOrRolling && finalConsolidatedSegments.length > 0) {
      const prevSeg = finalConsolidatedSegments[finalConsolidatedSegments.length - 1];
      
      // Merge with previous if it's also flat or rolling
      if (prevSeg.terrainType === 'flat' || prevSeg.terrainType === 'rolling_hills') {
        prevSeg.endIdx = seg.endIdx;
        prevSeg.totalElevationGain += seg.totalElevationGain;
        prevSeg.totalElevationLoss += seg.totalElevationLoss;
        // If either is rolling, the merged result should be rolling
        if (seg.terrainType === 'rolling_hills') {
          prevSeg.terrainType = 'rolling_hills';
        }
        continue;
      }
    }
    
    // Check if we should merge with next segment
    if (isShortFlatOrRolling && idx + 1 < consolidatedSegments.length) {
      const nextSeg = consolidatedSegments[idx + 1];
      
      // If next is also flat or rolling, let the next iteration handle merging
      if (nextSeg.terrainType === 'flat' || nextSeg.terrainType === 'rolling_hills') {
        // Merge this into the next segment
        consolidatedSegments[idx + 1] = {
          startIdx: seg.startIdx,
          endIdx: nextSeg.endIdx,
          terrainType: nextSeg.terrainType === 'rolling_hills' || seg.terrainType === 'rolling_hills' ? 'rolling_hills' : 'flat',
          totalElevationGain: seg.totalElevationGain + nextSeg.totalElevationGain,
          totalElevationLoss: seg.totalElevationLoss + nextSeg.totalElevationLoss,
        };
        continue;
      }
    }
    
    finalConsolidatedSegments.push({ ...seg });
  }
  
  // One more pass to merge any remaining consecutive segments of the same type
  const mergedSegments: ConsolidatedSegment[] = [];
  for (const seg of finalConsolidatedSegments) {
    if (mergedSegments.length > 0) {
      const prevSeg = mergedSegments[mergedSegments.length - 1];
      const prevDistKm = (processedPoints[prevSeg.endIdx].distanceM - processedPoints[prevSeg.startIdx].distanceM) / 1000;
      const currDistKm = (processedPoints[seg.endIdx].distanceM - processedPoints[seg.startIdx].distanceM) / 1000;
      
      // Merge consecutive flat/rolling sections if either is < 1km
      if ((prevSeg.terrainType === 'flat' || prevSeg.terrainType === 'rolling_hills') &&
          (seg.terrainType === 'flat' || seg.terrainType === 'rolling_hills') &&
          (prevDistKm < MIN_FLAT_ROLLING_LENGTH_KM || currDistKm < MIN_FLAT_ROLLING_LENGTH_KM)) {
        prevSeg.endIdx = seg.endIdx;
        prevSeg.totalElevationGain += seg.totalElevationGain;
        prevSeg.totalElevationLoss += seg.totalElevationLoss;
        if (seg.terrainType === 'rolling_hills') {
          prevSeg.terrainType = 'rolling_hills';
        }
        continue;
      }
      
      // Merge consecutive climbs
      if (prevSeg.terrainType === 'climb' && seg.terrainType === 'climb') {
        prevSeg.endIdx = seg.endIdx;
        prevSeg.totalElevationGain += seg.totalElevationGain;
        prevSeg.totalElevationLoss += seg.totalElevationLoss;
        continue;
      }
      
      // Merge consecutive descents
      if (prevSeg.terrainType === 'descent' && seg.terrainType === 'descent') {
        prevSeg.endIdx = seg.endIdx;
        prevSeg.totalElevationGain += seg.totalElevationGain;
        prevSeg.totalElevationLoss += seg.totalElevationLoss;
        continue;
      }
    }
    mergedSegments.push({ ...seg });
  }

  // Build final segment data from consolidated segments
  const segments: TerrainSegmentData['segments'] = [];
  let totalElevGain = 0;
  let totalElevLoss = 0;
  let totalTime = 0;

  const climbStats = { distanceKm: 0, timeSeconds: 0, elevationM: 0 };
  const descentStats = { distanceKm: 0, timeSeconds: 0, elevationM: 0 };
  const flatStats = { distanceKm: 0, timeSeconds: 0 };
  const rollingStats = { distanceKm: 0, timeSeconds: 0, elevationGainM: 0, elevationLossM: 0 };

  // Function to categorize grade including rolling hills
  function getGradeCategoryWithRolling(terrainType: string, gradePercent: number): string {
    if (terrainType === 'rolling_hills') return 'rolling';
    if (gradePercent > 8) return 'steep_climb';
    if (gradePercent > 5) return 'moderate_climb';
    if (gradePercent >= 3) return 'gentle_climb';
    if (gradePercent > -3) return 'flat';
    if (gradePercent > -5) return 'gentle_descent';
    if (gradePercent > -8) return 'moderate_descent';
    return 'steep_descent';
  }

  for (let idx = 0; idx < mergedSegments.length; idx++) {
    const seg = mergedSegments[idx];
    const startPoint = processedPoints[seg.startIdx];
    const endPoint = processedPoints[seg.endIdx];

    const distanceM = endPoint.distanceM - startPoint.distanceM;
    if (distanceM <= 0) continue;

    const distanceKm = distanceM / 1000;
    const elevChange = endPoint.elevation - startPoint.elevation;
    const gradePercent = (elevChange / distanceM) * 100;

    // Recalculate actual ascent/descent for this segment
    const { gain: segAscent, loss: segDescent } = calculateSegmentElevationDetails(seg.startIdx, seg.endIdx);

    // Time calculation
    let timeSeconds = 0;
    if (startPoint.time && endPoint.time) {
      timeSeconds = (endPoint.time.getTime() - startPoint.time.getTime()) / 1000;
    }

    // Pace calculation
    let paceMinKm = 0;
    if (timeSeconds > 0 && distanceKm > 0) {
      paceMinKm = (timeSeconds / 60) / distanceKm;
    }

    // GAP calculation
    const gradient = gradePercent / 100;
    const flatCost = 3.6;
    const actualCost = calculateMinettiCost(gradient);
    const costRatio = actualCost / flatCost;
    const gap = costRatio > 0 ? paceMinKm / costRatio : paceMinKm;

    // Track stats using actual ascent/descent
    totalElevGain += segAscent;
    totalElevLoss += segDescent;
    totalTime += timeSeconds;

    if (seg.terrainType === 'climb') {
      climbStats.distanceKm += distanceKm;
      climbStats.timeSeconds += timeSeconds;
      climbStats.elevationM += segAscent;
    } else if (seg.terrainType === 'descent') {
      descentStats.distanceKm += distanceKm;
      descentStats.timeSeconds += timeSeconds;
      descentStats.elevationM += segDescent;
    } else if (seg.terrainType === 'rolling_hills') {
      rollingStats.distanceKm += distanceKm;
      rollingStats.timeSeconds += timeSeconds;
      rollingStats.elevationGainM += segAscent;
      rollingStats.elevationLossM += segDescent;
    } else {
      flatStats.distanceKm += distanceKm;
      flatStats.timeSeconds += timeSeconds;
    }

    segments.push({
      segmentIndex: idx,
      terrainType: seg.terrainType,
      gradeCategory: getGradeCategoryWithRolling(seg.terrainType, gradePercent),
      startDistanceKm: Math.round((startPoint.distanceM / 1000) * 100) / 100,
      endDistanceKm: Math.round((endPoint.distanceM / 1000) * 100) / 100,
      distanceKm: Math.round(distanceKm * 100) / 100,
      elevationStartM: Math.round(startPoint.elevation),
      elevationEndM: Math.round(endPoint.elevation),
      totalAscentM: Math.round(segAscent),
      totalDescentM: Math.round(segDescent),
      averageGradePercent: Math.round(gradePercent * 10) / 10,
      timeSeconds: Math.round(timeSeconds),
      paceMinKm: Math.round(paceMinKm * 100) / 100,
      gradeAdjustedPaceMinKm: Math.round(gap * 100) / 100,
    });
  }

  const climbCount = segments.filter(s => s.terrainType === 'climb').length;
  const descentCount = segments.filter(s => s.terrainType === 'descent').length;
  const flatCount = segments.filter(s => s.terrainType === 'flat').length;

  return {
    activityId,
    totalDistanceKm: Math.round((totalDistance / 1000) * 100) / 100,
    totalElevationGainM: Math.round(totalElevGain),
    totalElevationLossM: Math.round(totalElevLoss),
    totalTimeSeconds: Math.round(totalTime),
    segments,
    summary: {
      climb: {
        totalDistanceKm: Math.round(climbStats.distanceKm * 100) / 100,
        totalTimeSeconds: Math.round(climbStats.timeSeconds),
        totalElevationM: Math.round(climbStats.elevationM),
        averagePaceMinKm: climbStats.distanceKm > 0
          ? Math.round(((climbStats.timeSeconds / 60) / climbStats.distanceKm) * 100) / 100
          : 0,
        segmentCount: climbCount,
      },
      descent: {
        totalDistanceKm: Math.round(descentStats.distanceKm * 100) / 100,
        totalTimeSeconds: Math.round(descentStats.timeSeconds),
        totalElevationM: Math.round(descentStats.elevationM),
        averagePaceMinKm: descentStats.distanceKm > 0
          ? Math.round(((descentStats.timeSeconds / 60) / descentStats.distanceKm) * 100) / 100
          : 0,
        segmentCount: descentCount,
      },
      flat: {
        totalDistanceKm: Math.round(flatStats.distanceKm * 100) / 100,
        totalTimeSeconds: Math.round(flatStats.timeSeconds),
        averagePaceMinKm: flatStats.distanceKm > 0
          ? Math.round(((flatStats.timeSeconds / 60) / flatStats.distanceKm) * 100) / 100
          : 0,
        segmentCount: flatCount,
      },
      totalSegments: segments.length,
    },
  };
}

/**
 * Parse GPX points including time data
 */
function parseGpxPointsWithTime(gpxContent: string): Array<{
  lat: number;
  lon: number;
  elevation: number;
  time: Date | null;
}> {
  const points: Array<{ lat: number; lon: number; elevation: number; time: Date | null }> = [];

  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([^]*?)<\/trkpt>/g;
  let match;

  while ((match = trkptRegex.exec(gpxContent)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const content = match[3];

    const eleMatch = content.match(/<ele>([^<]+)<\/ele>/);
    const elevation = eleMatch ? parseFloat(eleMatch[1]) : 0;

    const timeMatch = content.match(/<time>([^<]+)<\/time>/);
    const time = timeMatch ? new Date(timeMatch[1]) : null;

    if (!isNaN(lat) && !isNaN(lon)) {
      points.push({ lat, lon, elevation, time });
    }
  }

  return points;
}

/**
 * Calculate Haversine distance between two points (meters)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));

  return R * c;
}

/**
 * Apply Kalman filtering to smooth elevation data
 */
function kalmanSmoothElevation(elevations: number[]): number[] {
  const n = elevations.length;
  if (n < 2) return elevations;

  const R = 10.0; // Measurement noise
  const Q = 0.1; // Process noise

  let x = elevations[0];
  let P = 1.0;

  const smoothed = [x];

  for (let i = 1; i < n; i++) {
    const xPred = x;
    const PPred = P + Q;

    const K = PPred / (PPred + R);
    x = xPred + K * (elevations[i] - xPred);
    P = (1 - K) * PPred;

    smoothed.push(x);
  }

  return smoothed;
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
 * Minimum distance in km for an activity to be included in performance profile calculations.
 * Short runs don't provide meaningful data for race predictions.
 */
const MIN_ACTIVITY_DISTANCE_KM = 15;

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
      if (analysisResults?.processingStatus !== 'completed' || !analysisResults?.paceByGradient) {
        return false;
      }

      // Check minimum distance requirement (15km)
      // First try to get distance from analysis results, then fall back to activity's distanceKm
      const totalDistanceKm =
        (analysisResults.totalDistanceKm as number | undefined) ??
        (analysisResults.total_distance_km as number | undefined) ??
        a.distanceKm ??
        0;

      if (totalDistanceKm < MIN_ACTIVITY_DISTANCE_KM) {
        return false;
      }

      return true;
    });

    if (analyzedActivities.length === 0) {
      app.log.info(
        { userId, minDistanceKm: MIN_ACTIVITY_DISTANCE_KM },
        'No analyzed activities meeting minimum distance requirement for performance profile calculation'
      );
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

    // NEW: Accumulator for pace decay by progress percentage (from normalized pace profiles)
    const paceDecayByPct: Record<string, { sum: number; count: number }> = {
      '0-10': { sum: 0, count: 0 },
      '10-20': { sum: 0, count: 0 },
      '20-30': { sum: 0, count: 0 },
      '30-40': { sum: 0, count: 0 },
      '40-50': { sum: 0, count: 0 },
      '50-60': { sum: 0, count: 0 },
      '60-70': { sum: 0, count: 0 },
      '70-80': { sum: 0, count: 0 },
      '80-90': { sum: 0, count: 0 },
      '90-100': { sum: 0, count: 0 },
    };

    // NEW: Accumulator for absolute distance-based pace (0-5km, 5-10km, etc.)
    // This is what we'll actually use for predictions
    const paceByDistanceKm: Record<string, { sumPace: number; sumGap: number; count: number }> = {};

    let totalFatigueFactor = 0;
    let fatigueCount = 0;

    for (const activity of analyzedActivities) {
      const analysisResults = activity.analysisResults as Record<string, unknown>;
      const paceByGradient = analysisResults.paceByGradient as Record<string, number | null>;
      const fatigueFactor = analysisResults.fatigueFactor as number | undefined;
      const normalizedPaceProfile = analysisResults.normalizedPaceProfile as Record<string, unknown> | undefined;
      const paceByDistance5k = analysisResults.paceByDistance5k as Array<{
        segment_start_km: number;
        segment_end_km: number;
        actual_pace_min_km: number;
        grade_adjusted_pace_min_km: number;
      }> | undefined;

      // Calculate recency weight
      const activityDate = activity.activityDate || activity.createdAt;
      const daysAgo = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
      const weight = Math.exp(-daysAgo / 90); // 90-day half-life

      // Aggregate gradient paces
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

      // NEW: Aggregate pace by absolute distance (5km buckets)
      // This gives us: "At km 5, you typically run X pace; at km 10, you run Y pace"
      if (paceByDistance5k && Array.isArray(paceByDistance5k)) {
        for (const segment of paceByDistance5k) {
          // Create bucket key like "0-5", "5-10", "10-15", etc.
          const bucketKey = `${segment.segment_start_km}-${segment.segment_end_km}`;

          if (!paceByDistanceKm[bucketKey]) {
            paceByDistanceKm[bucketKey] = { sumPace: 0, sumGap: 0, count: 0 };
          }

          paceByDistanceKm[bucketKey].sumPace += segment.actual_pace_min_km * weight;
          paceByDistanceKm[bucketKey].sumGap += segment.grade_adjusted_pace_min_km * weight;
          paceByDistanceKm[bucketKey].count += weight;
        }
      }

      // NEW: Aggregate normalized pace profiles (GAP-based multipliers by race progress)
      if (normalizedPaceProfile) {
        const gapByProgressPct = normalizedPaceProfile.gap_by_progress_pct as Record<string, number> | undefined;
        const activityDistanceKm = normalizedPaceProfile.activity_distance_km as number | undefined;

        if (gapByProgressPct && activityDistanceKm) {
          // Weight longer activities more (they provide more reliable pacing data)
          const distanceWeight = weight * Math.log10(activityDistanceKm + 1);

          for (const [pctKey, multiplier] of Object.entries(gapByProgressPct)) {
            if (paceDecayByPct[pctKey]) {
              paceDecayByPct[pctKey].sum += multiplier * distanceWeight;
              paceDecayByPct[pctKey].count += distanceWeight;
            }
          }
        }
      }
    }

    // NEW: Calculate pace decay profile from aggregated data
    const paceDecayByProgressPct: Record<string, number> = {};
    for (const [pctKey, data] of Object.entries(paceDecayByPct)) {
      if (data.count > 0) {
        paceDecayByProgressPct[pctKey] = Math.round((data.sum / data.count) * 1000) / 1000;
      }
    }

    // NEW: Calculate absolute distance-based pace table
    // This is sorted by distance and gives us the actual pace at each 5km mark
    const paceByDistanceTable: Array<{
      distanceKm: number;
      paceMinKm: number;
      gapMinKm: number;
      sampleCount: number;
    }> = [];

    // Sort buckets by distance and calculate averages
    const sortedBuckets = Object.entries(paceByDistanceKm)
      .map(([key, data]) => {
        const [start, end] = key.split('-').map(Number);
        return {
          startKm: start,
          endKm: end,
          midpointKm: (start + end) / 2,
          paceMinKm: data.count > 0 ? data.sumPace / data.count : 0,
          gapMinKm: data.count > 0 ? data.sumGap / data.count : 0,
          sampleCount: data.count,
        };
      })
      .filter(b => b.sampleCount > 0)
      .sort((a, b) => a.startKm - b.startKm);

    for (const bucket of sortedBuckets) {
      paceByDistanceTable.push({
        distanceKm: bucket.midpointKm,
        paceMinKm: Math.round(bucket.paceMinKm * 100) / 100,
        gapMinKm: Math.round(bucket.gapMinKm * 100) / 100,
        sampleCount: Math.round(bucket.sampleCount * 100) / 100,
      });
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
        // NEW: Store pace decay profile by race progress percentage
        paceDecayByProgressPct: Object.keys(paceDecayByProgressPct).length > 0 ? paceDecayByProgressPct : null,
        // NEW: Store absolute distance-based pace table for predictions
        paceByDistanceTable: paceByDistanceTable.length > 0 ? paceByDistanceTable : null,
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
      hasPaceDecayProfile: Object.keys(paceDecayByProgressPct).length > 0,
      paceByDistanceEntries: paceByDistanceTable.length,
    }, 'Performance profile recalculated');
  } catch (error) {
    app.log.error({ error, userId }, 'Failed to recalculate performance profile');
    throw error;
  }
}
