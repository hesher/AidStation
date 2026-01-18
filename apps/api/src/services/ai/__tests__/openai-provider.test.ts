/**
 * OpenAI Provider Tests
 *
 * Unit tests for the OpenAI provider implementation.
 * These tests cover the actual API integration with mocked OpenAI responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../openai-provider';

// Store mock for manipulation in tests
let mockCreate = vi.fn();

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: (...args: unknown[]) => mockCreate(...args),
        },
      };
    },
  };
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate = vi.fn();
  });

  describe('constructor', () => {
    it('should not configure client when no API key provided', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider(undefined);
      expect(provider.isConfigured()).toBe(false);

      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should configure client with provided API key', () => {
      const provider = new OpenAIProvider('sk-test-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should use custom model when provided', () => {
      const provider = new OpenAIProvider('sk-test-key', 'gpt-4o');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('searchRace', () => {
    it('should throw when client is not configured', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider(undefined);

      await expect(provider.searchRace('Western States')).rejects.toThrow(
        'OpenAI client not configured'
      );

      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should return parsed race data from OpenAI response', async () => {
      const mockResponse = {
        name: 'Western States 100',
        date: '2025-06-28',
        location: 'Squaw Valley',
        country: 'USA',
        distanceKm: 161,
        elevationGainM: 5500,
        elevationLossM: 7000,
        startTime: '05:00',
        overallCutoffHours: 30,
        description: 'Historic 100-mile trail race',
        websiteUrl: 'https://www.wser.org',
        aidStations: [
          { name: 'Escarpment', distanceKm: 16, elevationM: 1200, hasDropBag: false, hasCrew: false },
          { name: 'Robinson Flat', distanceKm: 46, elevationM: 2100, hasDropBag: true, hasCrew: true },
        ],
        courseCoordinates: [
          { lat: 39.1965, lon: -120.2337, elevation: 1890 },
          { lat: 38.9308, lon: -121.0850, elevation: 100 },
        ],
      };

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockResponse),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Western States 100');

      expect(result.name).toBe('Western States 100');
      expect(result.distanceKm).toBe(161);
      expect(result.aidStations).toHaveLength(2);
      expect(result.courseCoordinates).toHaveLength(2);
    });

    it('should pass options to the prompt', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'Test Race', distanceKm: 50 }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await provider.searchRace('Test Race', {
        includeAidStations: false,
        includeCourseData: false,
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[1].content).not.toContain('Include all aid stations');
    });

    it('should throw when OpenAI returns empty response', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.searchRace('Test Race')).rejects.toThrow('No response from OpenAI');
    });

    it('should throw when OpenAI returns invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Not valid JSON',
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.searchRace('Test Race')).rejects.toThrow('Failed to parse AI response as JSON');
    });

    it('should handle missing name by using query as fallback', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ distanceKm: 100 }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Unknown Race');

      expect(result.name).toBe('Unknown Race');
    });

    it('should clean aid stations with NaN distances', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Race',
                aidStations: [
                  { name: 'Station 1', distanceKm: 10 },
                  { name: 'Station 2', distanceKm: NaN },
                  { name: 'Station 3', distanceKm: 'invalid' },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Test Race');

      expect(result.aidStations).toHaveLength(3);
      expect(result.aidStations![0].distanceKm).toBe(10);
      expect(result.aidStations![1].distanceKm).toBeNull();
      expect(result.aidStations![2].distanceKm).toBeNull();
    });

    it('should filter aid stations with empty names', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Race',
                aidStations: [
                  { name: 'Valid Station', distanceKm: 10 },
                  { name: '', distanceKm: 20 },
                  { distanceKm: 30 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Test Race');

      expect(result.aidStations).toHaveLength(1);
      expect(result.aidStations![0].name).toBe('Valid Station');
    });

    it('should filter invalid coordinates', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Race',
                courseCoordinates: [
                  { lat: 39.1, lon: -120.2 },
                  { lat: 'invalid', lon: -120.3 },
                  { lat: 39.2 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Test Race');

      expect(result.courseCoordinates).toHaveLength(1);
      expect(result.courseCoordinates![0].lat).toBe(39.1);
    });

    it('should convert string numbers to actual numbers', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Race',
                distanceKm: '100',
                elevationGainM: '5000',
                elevationLossM: '4500',
                overallCutoffHours: '24',
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Test Race');

      expect(result.distanceKm).toBe(100);
      expect(result.elevationGainM).toBe(5000);
      expect(result.elevationLossM).toBe(4500);
      expect(result.overallCutoffHours).toBe(24);
    });

    it('should sort aid stations by distance with nulls at end', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Race',
                aidStations: [
                  { name: 'Far', distanceKm: 50 },
                  { name: 'Unknown', distanceKm: null },
                  { name: 'Close', distanceKm: 10 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.searchRace('Test Race');

      expect(result.aidStations![0].name).toBe('Close');
      expect(result.aidStations![1].name).toBe('Far');
      expect(result.aidStations![2].name).toBe('Unknown');
    });
  });

  describe('updateRace', () => {
    it('should throw when client is not configured', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider(undefined);

      await expect(provider.updateRace('Add milestone', { raceDistanceKm: 100 })).rejects.toThrow(
        'OpenAI client not configured'
      );

      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should return parsed update result from OpenAI response', async () => {
      const mockResponse = {
        success: true,
        message: 'Added 10 milestones',
        waypointUpdates: [
          { action: 'add', name: '5km Marker', distanceKm: 5, waypointType: 'milestone' },
          { action: 'add', name: '10km Marker', distanceKm: 10, waypointType: 'milestone' },
        ],
      };

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockResponse),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add milestone every 5km', { raceDistanceKm: 50 });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Added 10 milestones');
      expect(result.waypointUpdates).toHaveLength(2);
    });

    it('should include existing waypoints in context', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Updated',
                waypointUpdates: [],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await provider.updateRace('Update race', {
        raceDistanceKm: 100,
        existingWaypoints: [
          { name: 'Start', distanceKm: 0, waypointType: 'checkpoint', elevationM: 500 },
          { name: 'Aid 1', distanceKm: 25, waypointType: 'aid_station', elevationM: 1000 },
        ],
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('Existing waypoints');
      expect(callArgs.messages[1].content).toContain('Start');
      expect(callArgs.messages[1].content).toContain('Aid 1');
    });

    it('should include course coordinates elevation samples', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Found peaks',
                waypointUpdates: [
                  { action: 'add', name: 'Summit', distanceKm: 50, waypointType: 'peak', elevationM: 2500 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await provider.updateRace('Add peaks', {
        raceDistanceKm: 100,
        courseCoordinates: Array.from({ length: 100 }, (_, i) => ({
          lat: 39 + i * 0.01,
          lon: -120 + i * 0.01,
          elevation: 1000 + Math.sin(i * 0.1) * 500,
        })),
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('coordinate points');
      expect(callArgs.messages[1].content).toContain('Elevation profile');
    });

    it('should return failure result for invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Invalid JSON response',
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add milestone', { raceDistanceKm: 100 });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to parse AI response');
      expect(result.waypointUpdates).toEqual([]);
    });

    it('should throw when OpenAI returns empty response', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.updateRace('Add milestone', { raceDistanceKm: 100 })).rejects.toThrow(
        'No response from OpenAI'
      );
    });

    it('should filter invalid waypoint updates', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Added waypoints',
                waypointUpdates: [
                  { action: 'add', name: 'Valid', distanceKm: 10, waypointType: 'milestone' },
                  { action: 'add', name: '', distanceKm: 20, waypointType: 'milestone' },
                  { action: 'invalid', name: 'Bad Action', distanceKm: 30 },
                  { action: 'add', distanceKm: 40 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add waypoints', { raceDistanceKm: 100 });

      expect(result.waypointUpdates).toHaveLength(1);
      expect(result.waypointUpdates[0].name).toBe('Valid');
    });

    it('should sort waypoint updates by distance', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Added waypoints',
                waypointUpdates: [
                  { action: 'add', name: 'Far', distanceKm: 50, waypointType: 'milestone' },
                  { action: 'add', name: 'Unknown', distanceKm: null, waypointType: 'milestone' },
                  { action: 'add', name: 'Close', distanceKm: 10, waypointType: 'milestone' },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add waypoints', { raceDistanceKm: 100 });

      expect(result.waypointUpdates[0].name).toBe('Close');
      expect(result.waypointUpdates[1].name).toBe('Far');
      expect(result.waypointUpdates[2].name).toBe('Unknown');
    });

    it('should preserve cutoff times in waypoint updates', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Added checkpoint',
                waypointUpdates: [
                  {
                    action: 'add',
                    name: 'CP1',
                    distanceKm: 50,
                    waypointType: 'checkpoint',
                    cutoffTime: '14:30',
                    cutoffHoursFromStart: 7.5,
                  },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add checkpoint at 50km with 7.5 hour cutoff', { raceDistanceKm: 100 });

      expect(result.waypointUpdates[0].cutoffTime).toBe('14:30');
      expect(result.waypointUpdates[0].cutoffHoursFromStart).toBe(7.5);
    });

    it('should preserve service flags in waypoint updates', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Added aid station',
                waypointUpdates: [
                  {
                    action: 'add',
                    name: 'Main Aid',
                    distanceKm: 50,
                    waypointType: 'aid_station',
                    hasDropBag: true,
                    hasCrew: true,
                    hasPacer: false,
                  },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add aid station at 50km', { raceDistanceKm: 100 });

      expect(result.waypointUpdates[0].hasDropBag).toBe(true);
      expect(result.waypointUpdates[0].hasCrew).toBe(true);
      expect(result.waypointUpdates[0].hasPacer).toBe(false);
    });

    it('should default waypointType to milestone when not specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                message: 'Added marker',
                waypointUpdates: [
                  { action: 'add', name: '5km', distanceKm: 5 },
                ],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Add 5km marker', { raceDistanceKm: 100 });

      expect(result.waypointUpdates[0].waypointType).toBe('milestone');
    });

    it('should set default message when missing', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: true,
                waypointUpdates: [],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Update', { raceDistanceKm: 100 });

      expect(result.message).toBe('Updates generated successfully');
    });

    it('should set failure message when missing and success is false', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                success: false,
                waypointUpdates: [],
              }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.updateRace('Update', { raceDistanceKm: 100 });

      expect(result.message).toBe('Failed to process instruction');
    });
  });
});
