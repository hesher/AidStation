/**
 * Race Routes Tests
 *
 * Integration tests for race API endpoints.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { raceRoutes } from '../races';
import * as aiService from '../../services/ai';
import type { RaceSearchResult, AIProvider, RaceUpdateResult } from '../../services/ai';

// Mock database repositories
vi.mock('../../db/repositories', () => ({
  getOrCreateSessionUser: vi.fn().mockResolvedValue('test-user-id'),
  createRace: vi.fn().mockImplementation((data, aidStations) => Promise.resolve({
    id: 'race-123',
    name: data.name,
    date: data.date ? new Date(data.date) : null,
    location: data.location,
    country: data.country,
    distanceKm: data.distanceKm,
    elevationGainM: data.elevationGainM,
    elevationLossM: data.elevationLossM,
    startTime: data.startTime,
    overallCutoffHours: data.overallCutoffHours,
    ownerId: data.ownerId,
    metadata: data.metadata,
    aidStations: aidStations || [],
    createdAt: new Date(),
  })),
  getRaceById: vi.fn().mockImplementation((id) => {
    if (id === '00000000-0000-0000-0000-000000000000') return Promise.resolve(null);
    return Promise.resolve({
      id,
      name: 'Western States 100',
      date: new Date('2025-06-28'),
      location: 'California',
      country: 'USA',
      distanceKm: 161,
      elevationGainM: 5500,
      elevationLossM: 7000,
      startTime: '05:00',
      overallCutoffHours: 30,
      ownerId: 'test-user-id',
      metadata: { description: 'A legendary 100-mile race' },
      aidStations: [
        { name: 'Start', distanceKm: 0, elevationM: 1800, hasDropBag: false, hasCrew: false, hasPacer: false },
        { name: 'Lyon Ridge', distanceKm: 16.5, elevationM: 2200, hasDropBag: true, hasCrew: false, hasPacer: false },
      ],
      createdAt: new Date(),
    });
  }),
  updateRace: vi.fn().mockImplementation((id, data, aidStations) => Promise.resolve({
    id,
    name: data.name || 'Western States 100',
    date: data.date ? new Date(data.date) : new Date('2025-06-28'),
    location: data.location || 'California',
    country: data.country || 'USA',
    distanceKm: data.distanceKm ?? 161,
    elevationGainM: data.elevationGainM ?? 5500,
    elevationLossM: data.elevationLossM ?? 7000,
    startTime: data.startTime ?? '05:00',
    overallCutoffHours: data.overallCutoffHours ?? 30,
    metadata: data.metadata || {},
    aidStations: aidStations || [],
    createdAt: new Date(),
  })),
  deleteRace: vi.fn().mockImplementation((id) => {
    return Promise.resolve(id !== '00000000-0000-0000-0000-000000000000');
  }),
  upsertSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  getLastRaceId: vi.fn().mockImplementation((userId) => {
    if (userId === 'no-race-user') return Promise.resolve(null);
    return Promise.resolve('race-123');
  }),
  searchRaces: vi.fn().mockResolvedValue({
    races: [
      { id: 'race-1', name: 'Western States 100', date: new Date(), location: 'California', country: 'USA', distanceKm: 161, isPublic: true },
      { id: 'race-2', name: 'UTMB', date: new Date(), location: 'Chamonix', country: 'France', distanceKm: 171, isPublic: true },
    ],
    total: 2,
  }),
  getUniqueCountries: vi.fn().mockResolvedValue(['USA', 'France', 'Italy', 'Spain']),
  getRaceVersionHistory: vi.fn().mockResolvedValue({
    versions: [
      { id: 'v1', versionNumber: 1, name: 'Western States 100', date: new Date(), location: 'California', country: 'USA', distanceKm: 161, changeSummary: 'Initial', createdAt: new Date(), aidStationsSnapshot: [] },
    ],
    total: 1,
  }),
  getRaceVersion: vi.fn().mockImplementation((id, version) => {
    if (version > 5) return Promise.resolve(null);
    return Promise.resolve({
      id: 'v1',
      versionNumber: version,
      name: 'Western States 100',
      date: new Date(),
      location: 'California',
      country: 'USA',
      distanceKm: 161,
      startTime: '05:00',
      overallCutoffHours: 30,
      aidStationsSnapshot: [],
    });
  }),
  restoreRaceVersion: vi.fn().mockImplementation((id, version) => {
    if (version > 5) return Promise.resolve(null);
    return Promise.resolve({
      id,
      name: 'Western States 100',
      date: new Date(),
      location: 'California',
      country: 'USA',
      distanceKm: 161,
      elevationGainM: 5500,
      elevationLossM: 7000,
      startTime: '05:00',
      overallCutoffHours: 30,
      metadata: {},
      aidStations: [],
    });
  }),
}));

// Mock TaskQueue
vi.mock('../../services/queue/task-queue', () => ({
  TaskQueue: {
    isConnected: vi.fn().mockReturnValue(false),
    analyzeGpxCourse: vi.fn().mockResolvedValue({
      status: 'SUCCESS',
      result: {
        success: true,
        course_stats: { total_distance_km: 100, total_elevation_gain_m: 3000 },
        elevation_profile: [],
        aid_stations: [],
        coordinates: [],
      },
    }),
  },
}));

describe('Race Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await app.register(raceRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/races/search', () => {
    it('should return 400 for empty query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/search',
        payload: { query: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Race name is required');
    });

    it('should return 400 for missing query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/search',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should search for race and return enriched data', async () => {
      const mockRaceResult: RaceSearchResult = {
        name: 'Western States Endurance Run',
        distanceKm: 161,
        country: 'USA',
        location: 'California',
        elevationGainM: 5500,
        elevationLossM: 7000,
        aidStations: [
          { name: 'Start', distanceKm: 0, elevationM: 1800 },
          { name: 'Lyon Ridge', distanceKm: 10.5, elevationM: 2200 },
          { name: 'Red Star Ridge', distanceKm: 24.2, elevationM: 2400 },
          { name: 'Robinson Flat', distanceKm: 45.3, elevationM: 2100 },
        ],
      };

      // Mock the AI service
      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn().mockResolvedValue(mockRaceResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: '/api/races/search',
        payload: { query: 'Western States 100' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Western States Endurance Run');
      expect(body.data.distanceKm).toBe(161);

      // Check aid stations are enriched with calculated fields
      expect(body.data.aidStations).toHaveLength(4);
      expect(body.data.aidStations[0].distanceFromPrevKm).toBe(0);
      expect(body.data.aidStations[1].distanceFromPrevKm).toBe(10.5);
      expect(body.data.aidStations[2].distanceFromPrevKm).toBe(13.7); // 24.2 - 10.5

      // Check elevation gains are calculated
      expect(body.data.aidStations[1].elevationGainFromPrevM).toBe(400); // 2200 - 1800
      expect(body.data.aidStations[3].elevationLossFromPrevM).toBe(300); // 2400 - 2100
    });

    it('should handle AI service errors', async () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: '/api/races/search',
        payload: { query: 'Some Race' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('AI service unavailable');
    });

    it('should handle races without aid stations', async () => {
      const mockRaceResult: RaceSearchResult = {
        name: 'Simple 5K',
        distanceKm: 5,
        country: 'USA',
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn().mockResolvedValue(mockRaceResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: '/api/races/search',
        payload: { query: 'Simple 5K' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.aidStations).toBeUndefined();
    });
  });

  describe('GET /api/races/:id', () => {
    it('should return 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/races/invalid-uuid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid race ID format');
    });

    it('should return a race when found', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await app.inject({
        method: 'GET',
        url: `/api/races/${validUuid}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(validUuid);
      expect(body.data.name).toBe('Western States 100');
    });

    it('should return 404 when race not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/races/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Race not found');
    });
  });

  describe('POST /api/races', () => {
    it('should return 400 for missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races',
        payload: {
          distanceKm: 100,
          country: 'USA',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should create a race with valid data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races',
        payload: {
          name: 'Test Race',
          distanceKm: 100,
          country: 'USA',
          location: 'California',
          elevationGainM: 3000,
          elevationLossM: 3000,
          startTime: '06:00',
          aidStations: [
            { name: 'Start', distanceKm: 0 },
            { name: 'Aid 1', distanceKm: 25 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('race-123');
      expect(body.data.name).toBe('Test Race');
    });

    it('should set session cookie on race creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races',
        payload: {
          name: 'Cookie Test Race',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie']).toContain('aidstation_session');
    });
  });

  describe('PUT /api/races/:id', () => {
    it('should return 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/races/invalid-uuid',
        payload: {
          name: 'Updated Race',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid race ID format');
    });

    it('should return 404 for non-existent race', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/races/00000000-0000-0000-0000-000000000000',
        payload: {
          name: 'Updated Race',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Race not found');
    });

    it('should update an existing race', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await app.inject({
        method: 'PUT',
        url: `/api/races/${validUuid}`,
        payload: {
          name: 'Updated Race Name',
          distanceKm: 150,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Race Name');
    });
  });

  describe('DELETE /api/races/:id', () => {
    it('should delete an existing race', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/races/${validUuid}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent race', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/races/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Race not found');
    });
  });

  describe('GET /api/races', () => {
    it('should list races', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/races',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.races).toBeDefined();
      expect(body.data.races).toHaveLength(2);
      expect(body.data.total).toBe(2);
    });

    it('should accept search parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/races?search=Western&country=USA&limit=10&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/races/countries', () => {
    it('should return list of unique countries', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/races/countries',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(['USA', 'France', 'Italy', 'Spain']);
    });
  });

  describe('POST /api/races/:id/update-with-ai', () => {
    it('should return 400 for empty instruction', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Instruction is required');
    });

    it('should return 400 for missing instruction', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Instruction is required');
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/invalid-uuid/update-with-ai',
        payload: {
          instruction: 'Add milestones every 5km',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid race ID format');
    });

    it('should return 404 for non-existent race', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/00000000-0000-0000-0000-000000000000/update-with-ai',
        payload: {
          instruction: 'Add milestones every 5km',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Race not found');
    });

    it('should process AI update instruction', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';

      // Set up a mock provider for this test
      const mockUpdateResult = {
        success: true,
        message: 'Added 3 milestones',
        waypointUpdates: [
          { action: 'add' as const, name: '50km', distanceKm: 50, waypointType: 'milestone' },
          { action: 'add' as const, name: '100km', distanceKm: 100, waypointType: 'milestone' },
        ],
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockResolvedValue(mockUpdateResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: 'Add milestones every 50km',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Added 3 milestones');
      expect(body.data.waypointUpdates).toHaveLength(2);
      expect(body.data.updatedAidStations).toBeDefined();
    });

    it('should handle AI service failure gracefully', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';

      // Set up a mock provider that fails
      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockRejectedValue(new Error('OpenAI API quota exceeded')),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: 'Add milestones every 50km',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('AI service error');
    });

    it('should handle AI returning unsuccessful result', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';

      // Set up a mock provider that returns unsuccessful
      const mockUpdateResult = {
        success: false,
        message: 'Could not interpret the instruction',
        waypointUpdates: [],
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockResolvedValue(mockUpdateResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: 'Do something unclear',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Could not interpret the instruction');
    });

    it('should handle update action in waypointUpdates', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';

      // Set up a mock provider that updates existing waypoint
      const mockUpdateResult = {
        success: true,
        message: 'Updated Lyon Ridge to view_point',
        waypointUpdates: [
          { action: 'update' as const, name: 'Lyon Ridge', distanceKm: 16.5, waypointType: 'view_point' },
        ],
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockResolvedValue(mockUpdateResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: 'Convert Lyon Ridge to a view point',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle remove action in waypointUpdates', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';

      // Set up a mock provider that removes a waypoint
      const mockUpdateResult = {
        success: true,
        message: 'Removed Lyon Ridge',
        waypointUpdates: [
          { action: 'remove' as const, name: 'Lyon Ridge', distanceKm: 16.5 },
        ],
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockResolvedValue(mockUpdateResult),
      };
      aiService.setDefaultAIProvider(mockProvider);

      const response = await app.inject({
        method: 'POST',
        url: `/api/races/${validUuid}/update-with-ai`,
        payload: {
          instruction: 'Remove the checkpoint at Lyon Ridge',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/races/analyze-gpx', () => {
    it('should return 400 for missing GPX content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/analyze-gpx',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('GPX content is required');
    });

    it('should return 503 when Python worker is not connected', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/races/analyze-gpx',
        payload: {
          gpxContent: '<gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>',
        },
      });

      // TaskQueue.isConnected returns false by default
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('Race Versioning API', () => {
    describe('GET /api/races/:id/versions', () => {
      it('should return 400 for invalid UUID format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/races/invalid-uuid/versions',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid race ID format');
      });

      it('should accept pagination parameters', async () => {
        const validUuid = '12345678-1234-1234-1234-123456789012';
        const response = await app.inject({
          method: 'GET',
          url: `/api/races/${validUuid}/versions?limit=5&offset=10`,
        });

        // Mocks are in place so should return 200 with versions
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.versions).toBeDefined();
      });
    });

    describe('GET /api/races/:id/versions/:version', () => {
      it('should return 400 for invalid UUID format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/races/invalid-uuid/versions/1',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid race ID format');
      });

      it('should return 400 for invalid version number', async () => {
        const validUuid = '12345678-1234-1234-1234-123456789012';
        const response = await app.inject({
          method: 'GET',
          url: `/api/races/${validUuid}/versions/invalid`,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid version number');
      });

      it('should return 400 for negative version number', async () => {
        const validUuid = '12345678-1234-1234-1234-123456789012';
        const response = await app.inject({
          method: 'GET',
          url: `/api/races/${validUuid}/versions/-1`,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid version number');
      });

      it('should return 400 for version 0', async () => {
        const validUuid = '12345678-1234-1234-1234-123456789012';
        const response = await app.inject({
          method: 'GET',
          url: `/api/races/${validUuid}/versions/0`,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid version number');
      });
    });

    describe('POST /api/races/:id/versions/:version/restore', () => {
      it('should return 400 for invalid UUID format', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/races/invalid-uuid/versions/1/restore',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid race ID format');
      });

      it('should return 400 for invalid version number', async () => {
        const validUuid = '12345678-1234-1234-1234-123456789012';
        const response = await app.inject({
          method: 'POST',
          url: `/api/races/${validUuid}/versions/invalid/restore`,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid version number');
      });
    });
  });
});
