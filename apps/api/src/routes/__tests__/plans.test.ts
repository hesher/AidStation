/**
 * Plan Routes Tests
 *
 * Tests for the race plan API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { planRoutes } from '../plans';

// Sample test data
const testUserId = 'test-user-123';
const testRace = {
  id: '12345678-1234-1234-1234-123456789012',
  name: 'Western States 100',
  distanceKm: 161,
  elevationGainM: 5500,
  elevationLossM: 7000,
  startTime: '05:00',
  overallCutoffHours: 30,
};

// Setup mock module - move the factory implementations inline to avoid hoisting issues
vi.mock('../../db/repositories', () => {
  const mockPlansInternal = new Map<string, Record<string, unknown>>();
  let planIdCounterInternal = 0;

  // Track the current session user based on session cookie
  const sessionUsers = new Map<string, string>();

  const mockGetOrCreateSessionUser = async (sessionId: string) => {
    // If we have a session ID, check if we already have a user for it
    if (sessionUsers.has(sessionId)) {
      return sessionUsers.get(sessionId)!;
    }
    // Create a new user for this session
    const userId = `user-${sessionId}`;
    sessionUsers.set(sessionId, userId);
    return userId;
  };

  const mockCreatePlan = async (data: { userId: string; raceId: string; name: string }) => {
    const id = `plan-${++planIdCounterInternal}`;
    const plan = {
      id,
      ...data,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      aidStationPredictions: null,
      predictedTotalMinutes: null,
      predictedFinishTime: null,
    };
    mockPlansInternal.set(id, plan);
    return plan;
  };

  const mockGetPlanById = async (id: string) => {
    return mockPlansInternal.get(id) || null;
  };

  const mockGetPlansByUser = async (userId: string, _options: Record<string, unknown> = {}) => {
    const userPlans = Array.from(mockPlansInternal.values()).filter(
      (p) => p.userId === userId
    );
    return { plans: userPlans, total: userPlans.length };
  };

  const mockGetPlansByRace = async (userId: string, raceId: string) => {
    return Array.from(mockPlansInternal.values()).filter(
      (p) => p.userId === userId && p.raceId === raceId
    );
  };

  const mockUpdatePlan = async (id: string, data: Partial<{ userId: string; raceId: string; name: string }>) => {
    const plan = mockPlansInternal.get(id);
    if (!plan) return null;
    const updated = { ...plan, ...data, updatedAt: new Date() };
    mockPlansInternal.set(id, updated);
    return updated;
  };

  const mockDeletePlan = async (id: string) => {
    return mockPlansInternal.delete(id);
  };

  // Use a valid UUID that matches what tests expect
  const TEST_RACE_ID = '12345678-1234-1234-1234-123456789012';

  const mockGetRaceForPrediction = async (raceId: string) => {
    const testRaceData = {
      id: TEST_RACE_ID,
      name: 'Western States 100',
      distanceKm: 161,
      elevationGainM: 5500,
      elevationLossM: 7000,
      startTime: '05:00',
      overallCutoffHours: 30,
    };

    const testAidStationsData = [
      {
        id: 'as-1',
        name: 'Lyon Ridge',
        distanceKm: 16.5,
        distanceFromPrevKm: 16.5,
        elevationM: 1900,
        elevationGainFromPrevM: 500,
        elevationLossFromPrevM: 100,
        cutoffHoursFromStart: 4.5,
        sortOrder: 0,
      },
      {
        id: 'as-2',
        name: 'Red Star Ridge',
        distanceKm: 24.5,
        distanceFromPrevKm: 8,
        elevationM: 2300,
        elevationGainFromPrevM: 600,
        elevationLossFromPrevM: 200,
        cutoffHoursFromStart: 7,
        sortOrder: 1,
      },
    ];

    if (raceId !== testRaceData.id) return null;
    return { race: testRaceData, aidStations: testAidStationsData };
  };

  const mockGetUserPerformanceForPrediction = async () => {
    return {
      flatPaceMinKm: 6.5,
      climbingPaceMinKm: 12.0,
      descendingPaceMinKm: 5.5,
      fatigueFactor: 1.08,
      profileData: null,
    };
  };

  const mockUpdatePlanPredictions = async (id: string, predictions: { aidStationPredictions: unknown; predictedTotalMinutes: number; predictedFinishTime: Date }) => {
    const plan = mockPlansInternal.get(id);
    if (!plan) return null;
    const updated = { ...plan, ...predictions, updatedAt: new Date() };
    mockPlansInternal.set(id, updated);
    return updated;
  };

  const mockSetActivePlan = async () => {
    // Mock implementation
  };

  // Export a clear function for tests to reset state
  const clearMocks = () => {
    mockPlansInternal.clear();
    sessionUsers.clear();
    planIdCounterInternal = 0;
  };

  return {
    getOrCreateSessionUser: mockGetOrCreateSessionUser,
    createPlan: mockCreatePlan,
    getPlanById: mockGetPlanById,
    getPlansByUser: mockGetPlansByUser,
    getPlansByRace: mockGetPlansByRace,
    updatePlan: mockUpdatePlan,
    deletePlan: mockDeletePlan,
    getRaceForPrediction: mockGetRaceForPrediction,
    getUserPerformanceForPrediction: mockGetUserPerformanceForPrediction,
    updatePlanPredictions: mockUpdatePlanPredictions,
    setActivePlan: mockSetActivePlan,
    __clearMocks: clearMocks,
  };
});

describe('Plan Routes', () => {
  let app: ReturnType<typeof Fastify>;
  // Import the mock clear function
  let clearMocks: () => void;

  beforeAll(async () => {
    app = Fastify();

    await app.register(cookie, {
      secret: 'test-secret',
    });

    await app.register(planRoutes, { prefix: '/api' });
    await app.ready();

    // Get the clear function from the mocked module
    const repositories = await import('../../db/repositories');
    clearMocks = (repositories as unknown as { __clearMocks: () => void }).__clearMocks;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear mocks between tests
    if (clearMocks) clearMocks();
  });

  // Helper to create a plan via API - use aidstation_session cookie
  const createPlanViaAPI = async (sessionId: string, raceId: string, name: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: {
        Cookie: `aidstation_session=${sessionId}`,
      },
      payload: {
        raceId,
        name,
      },
    });
    return JSON.parse(response.body);
  };

  describe('POST /api/plans', () => {
    it('should create a new plan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          raceId: testRace.id,
          name: 'My Race Plan',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('My Race Plan');
      expect(body.data.raceId).toBe(testRace.id);
    });

    it('should auto-create session user when no cookie provided', async () => {
      // With session-based auth, a new user is created automatically
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          raceId: testRace.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 for invalid raceId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          raceId: 'not-a-uuid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent race', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          raceId: '00000000-0000-0000-0000-000000000000',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/plans', () => {
    it('should return empty list when no plans exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans).toEqual([]);
      expect(body.data.total).toBe(0);
    });

    it('should return plans for authenticated user', async () => {
      // Create a plan first via API
      await createPlanViaAPI(testUserId, testRace.id, 'Test Plan');

      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans.length).toBeGreaterThan(0);
    });

    it('should auto-create session user when no cookie provided', async () => {
      // With session-based auth, a new user is created automatically
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans).toEqual([]);
    });
  });

  describe('GET /api/plans/:id', () => {
    it('should return a plan by ID', async () => {
      // Create plan via API
      const createResult = await createPlanViaAPI(testUserId, testRace.id, 'Test Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(planId);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/non-existent-id',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when accessing another users plan', async () => {
      // Create plan via API for another user
      const createResult = await createPlanViaAPI('other-user', testRace.id, 'Other User Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/plans/:id', () => {
    it('should update a plan', async () => {
      // Create plan via API
      const createResult = await createPlanViaAPI(testUserId, testRace.id, 'Original Name');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          name: 'Updated Name',
          basePaceMinKm: 7.0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/plans/non-existent-id',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          name: 'New Name',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when updating another users plan', async () => {
      // Create plan via API for another user
      const createResult = await createPlanViaAPI('other-user', testRace.id, 'Other User Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
        payload: {
          name: 'Hijacked!',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/plans/:id', () => {
    it('should delete a plan', async () => {
      // Create plan via API
      const createResult = await createPlanViaAPI(testUserId, testRace.id, 'To Be Deleted');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify it was deleted by trying to get it
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/plans/non-existent-id',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when deleting another users plan', async () => {
      // Create plan via API for another user
      const createResult = await createPlanViaAPI('other-user', testRace.id, 'Other User Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plans/${planId}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/plans/race/:raceId', () => {
    it('should return plans for a specific race', async () => {
      // Create plans via API
      await createPlanViaAPI(testUserId, testRace.id, 'Race Plan 1');
      await createPlanViaAPI(testUserId, testRace.id, 'Race Plan 2');

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/race/${testRace.id}`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans.length).toBe(2);
    });
  });

  describe('POST /api/plans/:id/predict', () => {
    it('should generate predictions for a plan', async () => {
      // Create plan via API
      const createResult = await createPlanViaAPI(testUserId, testRace.id, 'Prediction Test Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/${planId}/predict`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.aidStationPredictions).toBeDefined();
      expect(body.data.predictedTotalMinutes).toBeDefined();
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/non-existent-id/predict',
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/plans/:id/activate', () => {
    it('should activate a plan', async () => {
      // Create plan via API
      const createResult = await createPlanViaAPI(testUserId, testRace.id, 'Activate Test Plan');
      const planId = createResult.data.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/${planId}/activate`,
        headers: {
          Cookie: `aidstation_session=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});
