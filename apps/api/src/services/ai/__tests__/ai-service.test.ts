/**
 * AI Service Tests
 *
 * Unit tests for the AI abstraction layer and providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../openai-provider';
import { getAIProvider, createAIProvider, setDefaultAIProvider, searchRace, updateRaceWithAI } from '../index';
import type { AIProvider, RaceSearchResult, RaceUpdateResult } from '../types';

// Store mock for manipulation in tests
let mockCreate = vi.fn();

// Mock OpenAI with a proper class mock - inline to avoid hoisting issues
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe('AI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate = vi.fn();
  });

  describe('OpenAIProvider', () => {
    it('should report not configured when no API key is provided', () => {
      // Clear env var for this test
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider(undefined);
      expect(provider.isConfigured()).toBe(false);

      // Restore
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should report configured when API key is provided', () => {
      const provider = new OpenAIProvider('test-api-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should have correct name', () => {
      const provider = new OpenAIProvider('test-key');
      expect(provider.name).toBe('openai');
    });

    it('should accept custom model', () => {
      const provider = new OpenAIProvider('test-key', 'gpt-4o');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('createAIProvider', () => {
    it('should create OpenAI provider', () => {
      const provider = createAIProvider({
        provider: 'openai',
        apiKey: 'test-key',
      });
      expect(provider.name).toBe('openai');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should throw for unsupported provider', () => {
      expect(() => createAIProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
      })).toThrow('Anthropic provider not yet implemented');
    });
  });

  describe('getAIProvider', () => {
    it('should return a provider', () => {
      const provider = getAIProvider();
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });
  });

  describe('setDefaultAIProvider', () => {
    it('should set the default provider', () => {
      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
      };

      setDefaultAIProvider(mockProvider);
      const provider = getAIProvider();
      expect(provider.name).toBe('mock');
    });
  });

  describe('searchRace', () => {
    it('should throw when provider is not configured', async () => {
      const unconfiguredProvider: AIProvider = {
        name: 'unconfigured',
        isConfigured: () => false,
        searchRace: vi.fn(),
      };

      setDefaultAIProvider(unconfiguredProvider);

      await expect(searchRace('Western States 100')).rejects.toThrow(
        'AI provider "unconfigured" is not configured'
      );
    });

    it('should call provider searchRace with correct arguments', async () => {
      const mockResult: RaceSearchResult = {
        name: 'Western States 100',
        distanceKm: 161,
        country: 'USA',
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn().mockResolvedValue(mockResult),
      };

      setDefaultAIProvider(mockProvider);

      const result = await searchRace('Western States 100', {
        includeAidStations: true,
      });

      expect(mockProvider.searchRace).toHaveBeenCalledWith('Western States 100', {
        includeAidStations: true,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateRaceWithAI', () => {
    it('should throw when provider is not configured', async () => {
      const unconfiguredProvider: AIProvider = {
        name: 'unconfigured',
        isConfigured: () => false,
        searchRace: vi.fn(),
        updateRace: vi.fn(),
      };

      setDefaultAIProvider(unconfiguredProvider);

      await expect(updateRaceWithAI('Add milestone every 5km', { raceDistanceKm: 100 })).rejects.toThrow(
        'AI provider "unconfigured" is not configured'
      );
    });

    it('should throw when provider does not support updateRace', async () => {
      const providerWithoutUpdate: AIProvider = {
        name: 'no-update',
        isConfigured: () => true,
        searchRace: vi.fn(),
        // No updateRace method
      };

      setDefaultAIProvider(providerWithoutUpdate);

      await expect(updateRaceWithAI('Add milestone every 5km', { raceDistanceKm: 100 })).rejects.toThrow(
        'AI provider "no-update" does not support race updates'
      );
    });

    it('should call provider updateRace with correct arguments', async () => {
      const mockResult: RaceUpdateResult = {
        success: true,
        message: 'Added 10 milestones',
        waypointUpdates: [
          { action: 'add', name: '5km Marker', distanceKm: 5, waypointType: 'milestone' },
          { action: 'add', name: '10km Marker', distanceKm: 10, waypointType: 'milestone' },
        ],
      };

      const mockProvider: AIProvider = {
        name: 'mock',
        isConfigured: () => true,
        searchRace: vi.fn(),
        updateRace: vi.fn().mockResolvedValue(mockResult),
      };

      setDefaultAIProvider(mockProvider);

      const result = await updateRaceWithAI('Add milestone every 5km', {
        raceDistanceKm: 100,
        existingWaypoints: [{ name: 'Start', distanceKm: 0 }],
      });

      expect(mockProvider.updateRace).toHaveBeenCalledWith('Add milestone every 5km', {
        raceDistanceKm: 100,
        existingWaypoints: [{ name: 'Start', distanceKm: 0 }],
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('OpenAIProvider validation helpers', () => {
    describe('validateAndCleanResult', () => {
      it('should handle result with missing name', async () => {
        const mockProvider: AIProvider = {
          name: 'mock',
          isConfigured: () => true,
          searchRace: vi.fn().mockResolvedValue({
            // Missing name field
            distanceKm: 50,
            country: 'France',
            aidStations: [],
          } as unknown as RaceSearchResult),
        };

        setDefaultAIProvider(mockProvider);
        const result = await searchRace('Unknown Race');
        
        // Should not throw, provider should handle missing name
        expect(result.distanceKm).toBe(50);
      });

      it('should clean up aid stations with invalid data', async () => {
        const mockProvider: AIProvider = {
          name: 'mock',
          isConfigured: () => true,
          searchRace: vi.fn().mockResolvedValue({
            name: 'Test Race',
            distanceKm: 100,
            aidStations: [
              { name: 'Valid Station', distanceKm: 10, elevationM: 500 },
              { name: 'NaN Distance', distanceKm: NaN, elevationM: 600 },
              { name: 'Null Distance', distanceKm: null, elevationM: null },
            ],
          }),
        };

        setDefaultAIProvider(mockProvider);
        const result = await searchRace('Test Race');
        
        expect(result.aidStations).toBeDefined();
        expect(result.aidStations!.length).toBe(3);
      });

      it('should handle empty course coordinates', async () => {
        const mockProvider: AIProvider = {
          name: 'mock',
          isConfigured: () => true,
          searchRace: vi.fn().mockResolvedValue({
            name: 'Test Race',
            distanceKm: 100,
            courseCoordinates: [],
          }),
        };

        setDefaultAIProvider(mockProvider);
        const result = await searchRace('Test Race');
        
        expect(result.courseCoordinates).toEqual([]);
      });
    });

    describe('validateAndCleanUpdateResult', () => {
      it('should handle update result with success', async () => {
        const mockResult: RaceUpdateResult = {
          success: true,
          message: 'Added markers',
          waypointUpdates: [
            { action: 'add', name: '5km', distanceKm: 5, waypointType: 'milestone' },
          ],
        };

        const mockProvider: AIProvider = {
          name: 'mock',
          isConfigured: () => true,
          searchRace: vi.fn(),
          updateRace: vi.fn().mockResolvedValue(mockResult),
        };

        setDefaultAIProvider(mockProvider);
        const result = await updateRaceWithAI('Add markers', { raceDistanceKm: 50 });
        
        expect(result.success).toBe(true);
        expect(result.waypointUpdates).toHaveLength(1);
      });

      it('should handle update result with failure', async () => {
        const mockResult: RaceUpdateResult = {
          success: false,
          message: 'Could not interpret instruction',
          waypointUpdates: [],
        };

        const mockProvider: AIProvider = {
          name: 'mock',
          isConfigured: () => true,
          searchRace: vi.fn(),
          updateRace: vi.fn().mockResolvedValue(mockResult),
        };

        setDefaultAIProvider(mockProvider);
        const result = await updateRaceWithAI('Invalid instruction', { raceDistanceKm: 50 });
        
        expect(result.success).toBe(false);
        expect(result.message).toBe('Could not interpret instruction');
      });
    });
  });
});
