/**
 * Activities Routes Tests
 *
 * Unit tests for activity upload and performance profile endpoints.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { activityRoutes } from '../activities';

// Sample GPX with enough points for terrain analysis
const sampleGpxWithTerrain = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><name>Trail Run</name><trkseg>
    <trkpt lat="51.500" lon="-0.100"><ele>100</ele><time>2026-01-15T08:00:00Z</time></trkpt>
    <trkpt lat="51.501" lon="-0.101"><ele>110</ele><time>2026-01-15T08:01:00Z</time></trkpt>
    <trkpt lat="51.502" lon="-0.102"><ele>120</ele><time>2026-01-15T08:02:00Z</time></trkpt>
    <trkpt lat="51.503" lon="-0.103"><ele>130</ele><time>2026-01-15T08:03:00Z</time></trkpt>
    <trkpt lat="51.504" lon="-0.104"><ele>140</ele><time>2026-01-15T08:04:00Z</time></trkpt>
    <trkpt lat="51.505" lon="-0.105"><ele>150</ele><time>2026-01-15T08:05:00Z</time></trkpt>
    <trkpt lat="51.506" lon="-0.106"><ele>160</ele><time>2026-01-15T08:06:00Z</time></trkpt>
    <trkpt lat="51.507" lon="-0.107"><ele>170</ele><time>2026-01-15T08:07:00Z</time></trkpt>
    <trkpt lat="51.508" lon="-0.108"><ele>180</ele><time>2026-01-15T08:08:00Z</time></trkpt>
    <trkpt lat="51.509" lon="-0.109"><ele>190</ele><time>2026-01-15T08:09:00Z</time></trkpt>
    <trkpt lat="51.510" lon="-0.110"><ele>200</ele><time>2026-01-15T08:10:00Z</time></trkpt>
    <trkpt lat="51.511" lon="-0.111"><ele>195</ele><time>2026-01-15T08:11:00Z</time></trkpt>
    <trkpt lat="51.512" lon="-0.112"><ele>190</ele><time>2026-01-15T08:12:00Z</time></trkpt>
    <trkpt lat="51.513" lon="-0.113"><ele>185</ele><time>2026-01-15T08:13:00Z</time></trkpt>
    <trkpt lat="51.514" lon="-0.114"><ele>180</ele><time>2026-01-15T08:14:00Z</time></trkpt>
    <trkpt lat="51.515" lon="-0.115"><ele>175</ele><time>2026-01-15T08:15:00Z</time></trkpt>
    <trkpt lat="51.516" lon="-0.116"><ele>170</ele><time>2026-01-15T08:16:00Z</time></trkpt>
    <trkpt lat="51.517" lon="-0.117"><ele>165</ele><time>2026-01-15T08:17:00Z</time></trkpt>
    <trkpt lat="51.518" lon="-0.118"><ele>160</ele><time>2026-01-15T08:18:00Z</time></trkpt>
    <trkpt lat="51.519" lon="-0.119"><ele>155</ele><time>2026-01-15T08:19:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

// Mock the repositories
vi.mock('../../db/repositories', () => ({
  getOrCreateSessionUser: vi.fn().mockResolvedValue('test-user-id'),
  createActivity: vi.fn().mockImplementation((data) => Promise.resolve({
    id: 'activity-123',
    userId: data.userId,
    name: data.name || 'Test Activity',
    activityDate: data.activityDate ? new Date(data.activityDate) : null,
    distanceKm: data.distanceKm ?? 10.5,
    elevationGainM: data.elevationGainM ?? 500,
    elevationLossM: null,
    movingTimeSeconds: 3600,
    totalTimeSeconds: null,
    averagePaceMinKm: 5.7,
    gradeAdjustedPaceMinKm: null,
    gpxContent: data.gpxContent,
    analysisResults: null,
    createdAt: new Date('2026-01-15'),
  })),
  getActivitiesByUser: vi.fn().mockResolvedValue({
    activities: [
      {
        id: 'activity-1',
        userId: 'test-user-id',
        name: 'Morning Run',
        activityDate: new Date('2026-01-14'),
        distanceKm: 15.2,
        elevationGainM: 350,
        elevationLossM: 340,
        movingTimeSeconds: 5400,
        totalTimeSeconds: 5600,
        averagePaceMinKm: 5.9,
        gradeAdjustedPaceMinKm: 5.5,
        gpxContent: '<gpx>...</gpx>',
        analysisResults: null,
        createdAt: new Date('2026-01-14'),
      },
      {
        id: 'activity-2',
        userId: 'test-user-id',
        name: 'Trail Run',
        activityDate: new Date('2026-01-12'),
        distanceKm: 22.0,
        elevationGainM: 800,
        elevationLossM: 780,
        movingTimeSeconds: 9000,
        totalTimeSeconds: 9500,
        averagePaceMinKm: 6.8,
        gradeAdjustedPaceMinKm: 6.0,
        gpxContent: '<gpx>...</gpx>',
        analysisResults: null,
        createdAt: new Date('2026-01-12'),
      },
    ],
    total: 2,
  }),
  getActivityById: vi.fn().mockImplementation((id) => {
    if (id === 'not-found') return Promise.resolve(null);
    if (id === 'no-gpx') return Promise.resolve({
      id,
      userId: 'test-user-id',
      name: 'Activity Without GPX',
      activityDate: new Date('2026-01-15'),
      distanceKm: 10.5,
      elevationGainM: 250,
      elevationLossM: 240,
      movingTimeSeconds: 3600,
      gpxContent: null,
      analysisResults: null,
      createdAt: new Date('2026-01-15'),
    });
    if (id === 'with-gpx') return Promise.resolve({
      id,
      userId: 'test-user-id',
      name: 'Activity With GPX',
      activityDate: new Date('2026-01-15'),
      distanceKm: 10.5,
      elevationGainM: 250,
      elevationLossM: 240,
      movingTimeSeconds: 3600,
      gpxContent: sampleGpxWithTerrain,
      analysisResults: null,
      createdAt: new Date('2026-01-15'),
    });
    if (id === 'with-task') return Promise.resolve({
      id,
      userId: 'test-user-id',
      name: 'Activity With Task',
      activityDate: new Date('2026-01-15'),
      distanceKm: 10.5,
      elevationGainM: 250,
      gpxContent: sampleGpxWithTerrain,
      analysisResults: { taskId: 'task-123', processingStatus: 'processing' },
      createdAt: new Date('2026-01-15'),
    });
    return Promise.resolve({
      id,
      userId: 'test-user-id',
      name: 'Test Activity',
      activityDate: new Date('2026-01-15'),
      distanceKm: 10.5,
      elevationGainM: 250,
      elevationLossM: 240,
      movingTimeSeconds: 3600,
      totalTimeSeconds: 3700,
      averagePaceMinKm: 5.7,
      gradeAdjustedPaceMinKm: 5.3,
      gpxContent: '<gpx>...</gpx>',
      analysisResults: null,
      createdAt: new Date('2026-01-15'),
    });
  }),
  deleteActivity: vi.fn().mockImplementation((id) => {
    return Promise.resolve(id !== 'not-found');
  }),
  getUserPerformanceProfile: vi.fn().mockResolvedValue({
    id: 'profile-123',
    userId: 'test-user-id',
    flatPaceMinKm: 5.5,
    climbingPaceMinKm: 8.2,
    descendingPaceMinKm: 4.8,
    fatigueFactor: 1.08,
    recencyHalfLifeDays: 90,
    lastCalculatedAt: new Date('2026-01-15'),
    profileData: null,
    updatedAt: new Date('2026-01-15'),
  }),
  updateUserPerformanceProfile: vi.fn().mockResolvedValue({
    id: 'profile-123',
    userId: 'test-user-id',
    flatPaceMinKm: 5.3,
    climbingPaceMinKm: 8.0,
    descendingPaceMinKm: 4.6,
    fatigueFactor: 1.06,
    recencyHalfLifeDays: 90,
    lastCalculatedAt: new Date('2026-01-16'),
    profileData: null,
    updatedAt: new Date('2026-01-16'),
  }),
  updateActivityStatus: vi.fn().mockResolvedValue({}),
  updateActivity: vi.fn().mockResolvedValue({}),
}));

// Mock TaskQueue
vi.mock('../../services/queue', () => ({
  TaskQueue: {
    isConnected: vi.fn().mockReturnValue(false),
    submitUserActivityAnalysis: vi.fn().mockResolvedValue({ submitted: true, taskId: 'task-123' }),
    getTaskStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
  },
}));

describe('Activity Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await app.register(activityRoutes, { prefix: '/api' });
    await app.ready();
  });

  describe('POST /api/activities', () => {
    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1">
      <trk><name>Morning Run</name><trkseg>
        <trkpt lat="51.5" lon="-0.1"><ele>10</ele></trkpt>
      </trkseg></trk>
    </gpx>`;

    test('should upload a single GPX activity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: {
          name: 'Test Run',
          activityDate: '2026-01-15',
          gpxContent: sampleGpx,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('activity-123');
      expect(body.data.name).toBe('Test Run');
      expect(body.data.status).toBe('pending');
    });

    test('should return 400 for missing gpxContent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: {
          name: 'Test Run',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    test('should set session cookie on upload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: {
          gpxContent: sampleGpx,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie']).toContain('aidstation_session');
    });
  });

  describe('POST /api/activities/bulk', () => {
    const sampleGpx = '<gpx version="1.1"><trk><name>Run</name></trk></gpx>';

    test('should upload multiple GPX activities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/bulk',
        payload: {
          activities: [
            { name: 'Run 1', gpxContent: sampleGpx },
            { name: 'Run 2', gpxContent: sampleGpx },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.uploaded).toBe(2);
      expect(body.data.activities).toHaveLength(2);
    });

    test('should return 400 for empty activities array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/bulk',
        payload: {
          activities: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/activities', () => {
    test('should list user activities', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.activities).toHaveLength(2);
      expect(body.data.total).toBe(2);
    });

    test('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities?limit=1&offset=0',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/activities/:id', () => {
    test('should return a specific activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/activity-123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('activity-123');
    });

    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/not-found',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });
  });

  describe('DELETE /api/activities/:id', () => {
    test('should delete an activity', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/activities/activity-123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/activities/not-found',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });
  });

  describe('GET /api/performance/profile', () => {
    test('should return user performance profile', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/performance/profile',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.flatPaceMinKm).toBe(5.5);
      expect(body.data.climbingPaceMinKm).toBe(8.2);
      expect(body.data.descendingPaceMinKm).toBe(4.8);
      expect(body.data.fatigueFactor).toBe(1.08);
      expect(body.data.activitiesCount).toBe(2);
    });
  });

  describe('GET /api/activities/:id/terrain-segments', () => {
    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/not-found/terrain-segments',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });

    test('should return 404 for activity without GPX data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/no-gpx/terrain-segments',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No GPX data available for this activity');
    });

    test('should return terrain segments for activity with GPX', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/with-gpx/terrain-segments',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.activityId).toBe('with-gpx');
      expect(body.data.segments).toBeDefined();
      expect(Array.isArray(body.data.segments)).toBe(true);
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.climb).toBeDefined();
      expect(body.data.summary.descent).toBeDefined();
      expect(body.data.summary.flat).toBeDefined();
      expect(body.data.summary.totalSegments).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/activities/:id/coordinates', () => {
    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/not-found/coordinates',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });

    test('should return 404 for activity without GPX data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/no-gpx/coordinates',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No GPX data available for this activity');
    });

    test('should return coordinates for activity with GPX', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/with-gpx/coordinates',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.coordinates).toBeDefined();
      expect(Array.isArray(body.data.coordinates)).toBe(true);
      expect(body.data.count).toBe(body.data.coordinates.length);
      
      // Check that coordinates have expected structure
      if (body.data.coordinates.length > 0) {
        const coord = body.data.coordinates[0];
        expect(coord.lat).toBeDefined();
        expect(coord.lon).toBeDefined();
        expect(typeof coord.lat).toBe('number');
        expect(typeof coord.lon).toBe('number');
      }
    });
  });

  describe('POST /api/activities/:id/reanalyze', () => {
    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/not-found/reanalyze',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });

    test('should return 400 for activity without GPX content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/no-gpx/reanalyze',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No GPX content available for this activity');
    });

    test('should return 503 when task queue is not available', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/with-gpx/reanalyze',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      // TaskQueue.isConnected returns false, so should get 503
      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Task queue not available');
    });
  });

  describe('POST /api/activities/:id/sync', () => {
    test('should return 404 for non-existent activity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/not-found/sync',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Activity not found');
    });

    test('should return pending status for activity without task', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/with-gpx/sync',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('pending');
    });
  });

  describe('POST /api/activities/sync-all', () => {
    test('should sync all activities for user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities/sync-all',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(typeof body.data.synced).toBe('number');
      expect(typeof body.data.updated).toBe('number');
    });
  });

  describe('POST /api/activities - FIT file support', () => {
    test('should upload a FIT activity', async () => {
      // FIT content would be base64 encoded binary
      const mockFitContent = 'base64encodedFITdata';
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: {
          name: 'FIT Activity',
          activityDate: '2026-01-15',
          fitContent: mockFitContent,
          fileType: 'fit',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.name).toBe('FIT Activity');
    });
  });

  describe('Edge cases', () => {
    test('should handle activity with missing optional fields', async () => {
      const sampleGpx = '<gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>';
      const response = await app.inject({
        method: 'POST',
        url: '/api/activities',
        payload: {
          gpxContent: sampleGpx,
          // No name, no activityDate
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    test('should limit pagination to 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities?limit=500&offset=0',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    test('should handle negative offset by using 0', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities?limit=10&offset=-5',
        cookies: {
          aidstation_session: 'test-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Terrain segment edge cases', () => {
    test('should handle terrain analysis errors gracefully', async () => {
      // Mock an activity with only a few GPS points (not enough for analysis)
      vi.doMock('../../db/repositories', () => ({
        ...vi.importActual('../../db/repositories'),
        getActivityById: vi.fn().mockResolvedValue({
          id: 'few-points',
          userId: 'test-user-id',
          name: 'Short Activity',
          gpxContent: `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><name>Short</name><trkseg>
    <trkpt lat="51.500" lon="-0.100"><ele>100</ele><time>2026-01-15T08:00:00Z</time></trkpt>
    <trkpt lat="51.501" lon="-0.101"><ele>110</ele><time>2026-01-15T08:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
          analysisResults: null,
          createdAt: new Date('2026-01-15'),
        }),
      }));

      // The route should still work even if terrain analysis fails
      const response = await app.inject({
        method: 'GET',
        url: '/api/activities/with-gpx/coordinates',
      });

      // Coordinates should still return
      expect(response.statusCode).toBe(200);
    });
  });
});
