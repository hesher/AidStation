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
  // updateUserPerformanceProfile - will be used when Python worker integration is complete
} from '../db/repositories';

// Request validation schemas
const uploadActivitySchema = z.object({
  name: z.string().optional(),
  activityDate: z.string().optional(),
  gpxContent: z.string().min(1, 'GPX content is required'),
});

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
   * Upload a single GPX activity
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

      // Parse GPX to extract basic info
      const gpxInfo = parseGpxBasicInfo(validatedBody.gpxContent);

      // Create activity record
      const activity = await createActivity({
        userId,
        name: validatedBody.name || gpxInfo.name || 'Untitled Activity',
        activityDate: validatedBody.activityDate,
        gpxContent: validatedBody.gpxContent,
        distanceKm: gpxInfo.distanceKm,
        elevationGainM: gpxInfo.elevationGainM,
        status: 'pending',
      });

      // TODO: Queue activity for Python worker analysis
      // await queueActivityAnalysis(activity.id);

      // Set session cookie
      reply.setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });

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

      app.log.error({ error: errorMessage }, 'Failed to upload activity');

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

      return {
        success: true,
        data: {
          uploaded: uploadedActivities.length,
          activities: uploadedActivities,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      app.log.error({ error: errorMessage }, 'Failed to bulk upload activities');

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

      app.log.error({ error: errorMessage }, 'Failed to get activities');

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

      app.log.error({ error: errorMessage }, 'Failed to get activity');

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

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      app.log.error({ error: errorMessage }, 'Failed to delete activity');

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

      app.log.error({ error: errorMessage }, 'Failed to get performance profile');

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
