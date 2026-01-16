/**
 * Race Routes Tests
 *
 * Integration tests for race API endpoints.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { raceRoutes } from '../races';
import * as aiService from '../../services/ai';
import type { RaceSearchResult, AIProvider } from '../../services/ai';

describe('Race Routes', () => {
  const app = Fastify();

  beforeAll(async () => {
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

    it('should return 503 when database is not available', async () => {
      // Valid UUID format but database not connected
      const response = await app.inject({
        method: 'GET',
        url: '/api/races/12345678-1234-1234-1234-123456789012',
      });

      // Should return 503 (database not available) or 404 (not found)
      expect([404, 503]).toContain(response.statusCode);
    });
  });
});
