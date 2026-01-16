/**
 * AI Service Tests
 *
 * Unit tests for the AI abstraction layer and providers.
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../openai-provider';
import { getAIProvider, createAIProvider, setDefaultAIProvider, searchRace } from '../index';
import type { AIProvider, RaceSearchResult } from '../types';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe('AI Service', () => {
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
});
