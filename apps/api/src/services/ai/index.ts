/**
 * AI Service
 *
 * Central AI service that provides an abstraction layer over different AI providers.
 * Currently supports OpenAI, with the ability to add more providers.
 */

import { AIProvider, AISearchOptions, RaceSearchResult, AIServiceConfig, AIRaceUpdateOptions, RaceUpdateResult } from './types';
import { OpenAIProvider } from './openai-provider';

export * from './types';
export { OpenAIProvider } from './openai-provider';

let defaultProvider: AIProvider | null = null;

/**
 * Get the default AI provider
 */
export function getAIProvider(): AIProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIProvider();
  }
  return defaultProvider;
}

/**
 * Create an AI provider based on configuration
 */
export function createAIProvider(config: AIServiceConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config.apiKey, config.model);
    case 'anthropic':
      // Future: implement Anthropic provider
      throw new Error('Anthropic provider not yet implemented');
    case 'custom':
      // Future: implement custom provider with baseUrl
      throw new Error('Custom provider not yet implemented');
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

/**
 * Set the default AI provider
 */
export function setDefaultAIProvider(provider: AIProvider): void {
  defaultProvider = provider;
}

/**
 * Search for race information using AI
 */
export async function searchRace(
  query: string,
  options?: AISearchOptions
): Promise<RaceSearchResult> {
  const provider = getAIProvider();

  if (!provider.isConfigured()) {
    throw new Error(
      `AI provider "${provider.name}" is not configured. ` +
      'Please ensure the required API key is set.'
    );
  }

  return provider.searchRace(query, options);
}

/**
 * Update race details using AI interpretation of natural language instruction
 */
export async function updateRaceWithAI(
  instruction: string,
  options: AIRaceUpdateOptions
): Promise<RaceUpdateResult> {
  const provider = getAIProvider();

  if (!provider.isConfigured()) {
    throw new Error(
      `AI provider "${provider.name}" is not configured. ` +
      'Please ensure the required API key is set.'
    );
  }

  if (!provider.updateRace) {
    throw new Error(
      `AI provider "${provider.name}" does not support race updates.`
    );
  }

  return provider.updateRace(instruction, options);
}
