import { env, getActiveProvider, getProviderSetting } from '@avf/config';
import type { AIProvider } from './types.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { ClaudeProvider } from './providers/claude.js';
import { MockAIProvider } from './providers/mock.js';
import type { ResearchProvider } from './research/types.js';
import { MockResearchProvider } from './research/mock.js';
import { TavilyResearchProvider } from './research/tavily.js';

/**
 * Resolve the active provider for a group. DB overrides can select which
 * provider is active (`provider.<group>.active`) and disable it entirely.
 */
function resolveProvider(
  group: string,
  envProvider: string,
  fallback: string,
): { provider: string; setting: ReturnType<typeof getProviderSetting> } {
  const active = getActiveProvider(group, envProvider);
  const setting = getProviderSetting(active);
  if (setting && setting.enabled === false) {
    return { provider: fallback, setting: null };
  }
  return { provider: active, setting };
}

export function createAIProvider(providerName?: string): AIProvider {
  const { provider, setting } = resolveProvider('AI_TEXT', providerName ?? env.AI_TEXT_PROVIDER, 'MOCK');
  const apiKey = setting?.apiKey || undefined;
  const model = setting?.model || undefined;
  switch (provider) {
    case 'GEMINI':
      return new GeminiProvider(apiKey, model);
    case 'OPENAI':
      return new OpenAIProvider(apiKey, model);
    case 'CLAUDE':
      return new ClaudeProvider(apiKey, model);
    case 'MOCK':
    default:
      return new MockAIProvider();
  }
}

export function createResearchProvider(): ResearchProvider {
  const { provider, setting } = resolveProvider('RESEARCH', env.RESEARCH_PROVIDER, 'MOCK');
  const apiKey = setting?.apiKey || undefined;
  switch (provider) {
    case 'TAVILY':
      return new TavilyResearchProvider(apiKey);
    case 'EXA':
      throw new Error('EXA research provider is not enabled. Use RESEARCH_PROVIDER=TAVILY or MOCK.');
    case 'MOCK':
    default:
      return new MockResearchProvider();
  }
}

export {
  GeminiProvider,
  OpenAIProvider,
  ClaudeProvider,
  MockAIProvider,
  OpenAICompatibleProvider,
} from './providers/index.js';
export { MockResearchProvider } from './research/mock.js';
export { TavilyResearchProvider } from './research/tavily.js';

export type { AIProvider, AICompletionRequest, AICompletionResult } from './types.js';
export {
  AIProviderError,
  AIErrorCode,
  estimateCost,
  classifyHttpError,
  fetchWithTimeout,
  providerError,
} from './types.js';
export { extractJson, completeJson, completeJsonWithPool } from './util.js';
export type { ResearchProvider, ResearchRequest } from './research/types.js';
export type { SearchSource } from './research/types.js';
export { ContentPromptBuilder, buildTopicSuggestionPrompt, PLATFORM_RULES } from './content-prompt.js';
export { GeneratedTopicsSchema, GeneratedTopicSchema } from './content-prompt.js';
export {
  completeWithPool,
  buildTextProvider,
  textProviderPriority,
  resolvePriority,
  fallbackErrorClass,
  type PoolUsageRecord,
  type PoolResult,
  type ProviderPoolOptions,
} from './pool.js';
export type {
  BuildPromptInput,
  ChannelProfileInput,
  CampaignProfileInput,
  AssignmentOverrideInput,
  SeriesInput,
  TopicInput,
  KnowledgeInput,
  PreviousContentInput,
  PlatformRules,
  SuggestTopicsInput,
  SuggestTopicsResult,
  GeneratedTopics,
  GeneratedTopic,
} from './content-prompt.js';
