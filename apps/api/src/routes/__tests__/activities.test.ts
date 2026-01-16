/**
 * Activities Routes Tests
 *
 * Unit tests for activity upload and performance profile endpoints.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { activityRoutes } from '../activities';

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
});
