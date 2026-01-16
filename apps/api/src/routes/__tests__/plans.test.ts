/**
 * Plan Routes Tests
 *
 * Tests for the race plan API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { planRoutes } from '../plans';

// Mock the repositories
const mockPlans = new Map<string, Record<string, unknown>>();
let planIdCounter = 0;

// Sample test data
const testUserId = 'test-user-123';
const testRace = {
  id: 'test-race-123',
  name: 'Western States 100',
  distanceKm: 161,
  elevationGainM: 5500,
  elevationLossM: 7000,
  startTime: '05:00',
  overallCutoffHours: 30,
};

const testAidStations = [
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

// Mock repository functions
interface MockPlanData {
  userId: string;
  raceId: string;
  name: string;
}

interface MockPredictionData {
  aidStationPredictions: unknown;
  predictedTotalMinutes: number;
  predictedFinishTime: Date;
}

const mockCreatePlan = async (data: MockPlanData) => {
  const id = `plan-${++planIdCounter}`;
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
  mockPlans.set(id, plan);
  return plan;
};

const mockGetPlanById = async (id: string) => {
  return mockPlans.get(id) || null;
};

const mockGetPlansByUser = async (userId: string, _options: Record<string, unknown> = {}) => {
  const userPlans = Array.from(mockPlans.values()).filter(
    (p) => p.userId === userId
  );
  return { plans: userPlans, total: userPlans.length };
};

const mockGetPlansByRace = async (userId: string, raceId: string) => {
  return Array.from(mockPlans.values()).filter(
    (p) => p.userId === userId && p.raceId === raceId
  );
};

const mockUpdatePlan = async (id: string, data: Partial<MockPlanData>) => {
  const plan = mockPlans.get(id);
  if (!plan) return null;
  const updated = { ...plan, ...data, updatedAt: new Date() };
  mockPlans.set(id, updated);
  return updated;
};

const mockDeletePlan = async (id: string) => {
  return mockPlans.delete(id);
};

const mockGetRaceForPrediction = async (raceId: string) => {
  if (raceId !== testRace.id) return null;
  return { race: testRace, aidStations: testAidStations };
};

const mockGetUserPerformanceForPrediction = async (_userId: string) => {
  return {
    flatPaceMinKm: 6.5,
    climbingPaceMinKm: 12.0,
    descendingPaceMinKm: 5.5,
    fatigueFactor: 1.08,
    profileData: null,
  };
};

const mockUpdatePlanPredictions = async (id: string, predictions: MockPredictionData) => {
  const plan = mockPlans.get(id);
  if (!plan) return null;
  const updated = { ...plan, ...predictions, updatedAt: new Date() };
  mockPlans.set(id, updated);
  return updated;
};

const mockSetActivePlan = async () => {
  // Mock implementation
};

// Setup mock module
vi.mock('../../db/repositories', () => ({
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
}));

describe('Plan Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();

    await app.register(cookie, {
      secret: 'test-secret',
    });

    await app.register(planRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear mocks between tests
    mockPlans.clear();
    planIdCounter = 0;
  });

  describe('POST /api/plans', () => {
    it('should create a new plan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: {
          Cookie: `userId=${testUserId}`,
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

    it('should return 401 without userId cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          raceId: testRace.id,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid raceId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: {
          Cookie: `userId=${testUserId}`,
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
          Cookie: `userId=${testUserId}`,
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
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans).toEqual([]);
      expect(body.data.total).toBe(0);
    });

    it('should return plans for authenticated user', async () => {
      // Create a plan first
      await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Test Plan',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.plans.length).toBeGreaterThan(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/plans/:id', () => {
    it('should return a plan by ID', async () => {
      const plan = await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Test Plan',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(plan.id);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/non-existent-id',
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when accessing another users plan', async () => {
      const plan = await mockCreatePlan({
        userId: 'other-user',
        raceId: testRace.id,
        name: 'Other User Plan',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/plans/:id', () => {
    it('should update a plan', async () => {
      const plan = await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Original Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
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
          Cookie: `userId=${testUserId}`,
        },
        payload: {
          name: 'New Name',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when updating another users plan', async () => {
      const plan = await mockCreatePlan({
        userId: 'other-user',
        raceId: testRace.id,
        name: 'Other User Plan',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
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
      const plan = await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'To Be Deleted',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify it was deleted
      expect(mockPlans.has(plan.id)).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/plans/non-existent-id',
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 when deleting another users plan', async () => {
      const plan = await mockCreatePlan({
        userId: 'other-user',
        raceId: testRace.id,
        name: 'Other User Plan',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plans/${plan.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/plans/race/:raceId', () => {
    it('should return plans for a specific race', async () => {
      await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Race Plan 1',
      });
      await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Race Plan 2',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/plans/race/${testRace.id}`,
        headers: {
          Cookie: `userId=${testUserId}`,
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
      const plan = await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Prediction Test Plan',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/predict`,
        headers: {
          Cookie: `userId=${testUserId}`,
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
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/plans/:id/activate', () => {
    it('should activate a plan', async () => {
      const plan = await mockCreatePlan({
        userId: testUserId,
        raceId: testRace.id,
        name: 'Activate Test Plan',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/activate`,
        headers: {
          Cookie: `userId=${testUserId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});
