export type ProviderGroup = 'AI_TEXT' | 'RESEARCH' | 'IMAGE' | 'VIDEO' | 'VOICE';

export interface ProviderOption {
  id: string;
  label: string;
  requiresKey: boolean;
}

export interface ProviderGroupInfo {
  id: ProviderGroup;
  label: string;
  envKey: string;
  activeDefault: string;
  options: ProviderOption[];
}

/**
 * Catalog metadata for the provider pool. Free/paid and limits are
 * configurable metadata, not permanent guarantees — provider pricing changes.
 * `endpoint` is the official API base URL; `openAICompatible` providers are
 * driven through the shared /v1/chat/completions adapter.
 */
export interface ProviderCatalogEntry {
  id: string;
  category: ProviderGroup;
  label: string;
  endpoint: string;
  openAICompatible?: boolean;
  supportedModels: string[];
  freeTier: boolean;
  paid: boolean;
  capabilities: string[];
  docUrl: string;
  activeByDefault: boolean;
}

export const PROVIDER_GROUPS: ProviderGroupInfo[] = [
  {
    id: 'AI_TEXT',
    label: 'AI Text',
    envKey: 'AI_TEXT_PROVIDER',
    activeDefault: 'MOCK',
    options: [
      { id: 'GEMINI', label: 'Google Gemini', requiresKey: true },
      { id: 'OPENAI', label: 'OpenAI', requiresKey: true },
      { id: 'CLAUDE', label: 'Anthropic Claude', requiresKey: true },
      { id: 'GROQ', label: 'Groq', requiresKey: true },
      { id: 'DEEPSEEK', label: 'DeepSeek', requiresKey: true },
      { id: 'MISTRAL', label: 'Mistral', requiresKey: true },
      { id: 'XAI', label: 'xAI Grok', requiresKey: true },
      { id: 'COHERE', label: 'Cohere', requiresKey: true },
      { id: 'OPENROUTER', label: 'OpenRouter', requiresKey: true },
      { id: 'TOGETHER', label: 'Together AI', requiresKey: true },
      { id: 'CEREBRAS', label: 'Cerebras', requiresKey: true },
      { id: 'FIREWORKS', label: 'Fireworks AI', requiresKey: true },
      { id: 'QWEN', label: 'Qwen (DashScope)', requiresKey: true },
      { id: 'HUGGINGFACE', label: 'Hugging Face', requiresKey: true },
      { id: 'MOCK', label: 'Mock (offline)', requiresKey: false },
    ],
  },
  {
    id: 'RESEARCH',
    label: 'Research / Search',
    envKey: 'RESEARCH_PROVIDER',
    activeDefault: 'MOCK',
    options: [
      { id: 'TAVILY', label: 'Tavily', requiresKey: true },
      { id: 'EXA', label: 'Exa', requiresKey: true },
      { id: 'MOCK', label: 'Mock (offline)', requiresKey: false },
    ],
  },
  {
    id: 'IMAGE',
    label: 'Image',
    envKey: 'IMAGE_PROVIDER',
    activeDefault: 'MOCK',
    options: [
      { id: 'OPENAI', label: 'OpenAI Images', requiresKey: true },
      { id: 'GEMINI', label: 'Google Gemini Images', requiresKey: true },
      { id: 'STABILITY', label: 'Stability AI', requiresKey: true },
      { id: 'FAL', label: 'FAL.ai', requiresKey: true },
      { id: 'MOCK', label: 'Mock (offline)', requiresKey: false },
    ],
  },
  {
    id: 'VIDEO',
    label: 'Video',
    envKey: 'VIDEO_PROVIDER',
    activeDefault: 'MOCK',
    options: [
      { id: 'VEO', label: 'Google Veo', requiresKey: true },
      { id: 'KLING', label: 'Kling', requiresKey: true },
      { id: 'RUNWAY', label: 'Runway', requiresKey: true },
      { id: 'PIXVERSE', label: 'PixVerse', requiresKey: true },
      { id: 'AGNES', label: 'Agnes AI', requiresKey: true },
      { id: 'MOCK', label: 'Mock (offline)', requiresKey: false },
    ],
  },
  {
    id: 'VOICE',
    label: 'Voice / TTS',
    envKey: 'VOICE_PROVIDER',
    activeDefault: 'MOCK',
    options: [
      { id: 'OPENAI', label: 'OpenAI TTS', requiresKey: true },
      { id: 'GOOGLE', label: 'Google TTS', requiresKey: true },
      { id: 'ELEVENLABS', label: 'ElevenLabs', requiresKey: true },
      { id: 'MOCK', label: 'Mock (offline)', requiresKey: false },
    ],
  },
];

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'GEMINI', category: 'AI_TEXT', label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    freeTier: true, paid: true, capabilities: ['text', 'json', 'vision'],
    docUrl: 'https://ai.google.dev/gemini-api/docs/models', activeByDefault: true,
  },
  {
    id: 'OPENAI', category: 'AI_TEXT', label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    openAICompatible: true,
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    freeTier: false, paid: true, capabilities: ['text', 'json', 'vision'],
    docUrl: 'https://platform.openai.com/docs/models', activeByDefault: true,
  },
  {
    id: 'CLAUDE', category: 'AI_TEXT', label: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1',
    supportedModels: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-sonnet-4-20250514'],
    freeTier: false, paid: true, capabilities: ['text', 'json', 'vision'],
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models', activeByDefault: true,
  },
  {
    id: 'GROQ', category: 'AI_TEXT', label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    openAICompatible: true,
    supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    freeTier: true, paid: false, capabilities: ['text', 'json'],
    docUrl: 'https://console.groq.com/docs/models', activeByDefault: true,
  },
  {
    id: 'DEEPSEEK', category: 'AI_TEXT', label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    openAICompatible: true,
    supportedModels: ['deepseek-chat', 'deepseek-reasoner'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://api-docs.deepseek.com/', activeByDefault: true,
  },
  {
    id: 'MISTRAL', category: 'AI_TEXT', label: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1',
    openAICompatible: true,
    supportedModels: ['mistral-large-latest', 'mistral-small-latest'],
    freeTier: true, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://docs.mistral.ai/', activeByDefault: true,
  },
  {
    id: 'XAI', category: 'AI_TEXT', label: 'xAI Grok',
    endpoint: 'https://api.x.ai/v1',
    openAICompatible: true,
    supportedModels: ['grok-3', 'grok-3-mini', 'grok-2'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://docs.x.ai/docs/models', activeByDefault: true,
  },
  {
    id: 'COHERE', category: 'AI_TEXT', label: 'Cohere',
    endpoint: 'https://api.cohere.com/v1',
    openAICompatible: true,
    supportedModels: ['command-r-plus', 'command-r'],
    freeTier: true, paid: true, capabilities: ['text', 'json', 'embed'],
    docUrl: 'https://docs.cohere.com/', activeByDefault: true,
  },
  {
    id: 'OPENROUTER', category: 'AI_TEXT', label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    openAICompatible: true,
    supportedModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash', 'meta-llama/llama-3.3-70b'],
    freeTier: true, paid: true, capabilities: ['text', 'json', 'vision'],
    docUrl: 'https://openrouter.ai/docs/models', activeByDefault: true,
  },
  {
    id: 'TOGETHER', category: 'AI_TEXT', label: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    openAICompatible: true,
    supportedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://docs.together.ai/docs/models', activeByDefault: true,
  },
  {
    id: 'CEREBRAS', category: 'AI_TEXT', label: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1',
    openAICompatible: true,
    supportedModels: ['llama3.1-70b', 'llama-3.3-70b'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://docs.cerebras.ai/', activeByDefault: true,
  },
  {
    id: 'FIREWORKS', category: 'AI_TEXT', label: 'Fireworks AI',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    openAICompatible: true,
    supportedModels: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/qwen3-32b'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://docs.fireworks.ai/', activeByDefault: true,
  },
  {
    id: 'QWEN', category: 'AI_TEXT', label: 'Qwen (DashScope)',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openAICompatible: true,
    supportedModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    freeTier: false, paid: true, capabilities: ['text', 'json'],
    docUrl: 'https://help.aliyun.com/zh/model-studio/', activeByDefault: true,
  },
  {
    id: 'HUGGINGFACE', category: 'AI_TEXT', label: 'Hugging Face',
    endpoint: 'https://api-inference.huggingface.co/v1',
    openAICompatible: true,
    supportedModels: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
    freeTier: true, paid: false, capabilities: ['text', 'json'],
    docUrl: 'https://huggingface.co/docs/inference-providers', activeByDefault: true,
  },
  {
    id: 'TAVILY', category: 'RESEARCH', label: 'Tavily',
    endpoint: 'https://api.tavily.com',
    supportedModels: [], freeTier: true, paid: true, capabilities: ['search'],
    docUrl: 'https://docs.tavily.com/', activeByDefault: true,
  },
  {
    id: 'EXA', category: 'RESEARCH', label: 'Exa',
    endpoint: 'https://api.exa.ai',
    supportedModels: [], freeTier: true, paid: true, capabilities: ['search'],
    docUrl: 'https://docs.exa.ai/', activeByDefault: true,
  },
  {
    id: 'STABILITY', category: 'IMAGE', label: 'Stability AI',
    endpoint: 'https://api.stability.ai/v2beta',
    supportedModels: ['sd3.5', 'sd3.5-large', 'sd3-large'],
    freeTier: false, paid: true, capabilities: ['text-to-image'],
    docUrl: 'https://platform.stability.ai/docs/api-reference', activeByDefault: true,
  },
  {
    id: 'FAL', category: 'IMAGE', label: 'FAL.ai',
    endpoint: 'https://fal.run',
    supportedModels: ['fal-ai/flux/dev', 'fal-ai/flux/schnell'],
    freeTier: false, paid: true, capabilities: ['text-to-image', 'text-to-video'],
    docUrl: 'https://docs.fal.ai/', activeByDefault: true,
  },
  {
    id: 'VEO', category: 'VIDEO', label: 'Google Veo',
    endpoint: 'https://generativelanguage.googleapis.com',
    supportedModels: ['veo-3.1', 'veo-3', 'veo-2'],
    freeTier: true, paid: true, capabilities: ['text-to-video'],
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/veo', activeByDefault: true,
  },
  {
    id: 'KLING', category: 'VIDEO', label: 'Kling',
    endpoint: 'https://api.klingai.com',
    supportedModels: ['kling-v3', 'kling-v2', 'kling-v1'],
    freeTier: true, paid: true, capabilities: ['text-to-video'],
    docUrl: 'https://kling.ai/docs', activeByDefault: true,
  },
  {
    id: 'RUNWAY', category: 'VIDEO', label: 'Runway',
    endpoint: 'https://api.dev.runwayml.com',
    supportedModels: ['gen4', 'gen3a_turbo'],
    freeTier: false, paid: true, capabilities: ['text-to-video'],
    docUrl: 'https://docs.dev.runwayml.com/', activeByDefault: true,
  },
  {
    id: 'PIXVERSE', category: 'VIDEO', label: 'PixVerse',
    endpoint: 'https://api.pixverse.ai',
    supportedModels: ['pixverse-v4'],
    freeTier: false, paid: true, capabilities: ['text-to-video'],
    docUrl: 'https://pixverse.ai/docs', activeByDefault: true,
  },
  {
    id: 'AGNES', category: 'VIDEO', label: 'Agnes AI',
    endpoint: 'https://apihub.agnes-ai.com/v1',
    supportedModels: ['agnes-video-v2.0'],
    freeTier: true, paid: false, capabilities: ['text-to-video', 'image-to-video'],
    docUrl: 'https://wiki.agnes-ai.com/en/docs/agnes-video-v20', activeByDefault: true,
  },
  {
    id: 'ELEVENLABS', category: 'VOICE', label: 'ElevenLabs',
    endpoint: 'https://api.elevenlabs.io/v1',
    supportedModels: ['eleven_multilingual_v2', 'eleven_turbo_v2_5'],
    freeTier: true, paid: true, capabilities: ['tts'],
    docUrl: 'https://elevenlabs.io/docs/api-reference', activeByDefault: true,
  },
];

export const KEY_ENV_BY_PROVIDER: Record<string, string> = {
  GEMINI: 'GEMINI_API_KEY',
  OPENAI: 'OPENAI_API_KEY',
  CLAUDE: 'ANTHROPIC_API_KEY',
  GROQ: 'GROQ_API_KEY',
  DEEPSEEK: 'DEEPSEEK_API_KEY',
  MISTRAL: 'MISTRAL_API_KEY',
  XAI: 'XAI_API_KEY',
  COHERE: 'COHERE_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
  TOGETHER: 'TOGETHER_API_KEY',
  CEREBRAS: 'CEREBRAS_API_KEY',
  FIREWORKS: 'FIREWORKS_API_KEY',
  QWEN: 'QWEN_API_KEY',
  HUGGINGFACE: 'HUGGINGFACE_API_KEY',
  TAVILY: 'TAVILY_API_KEY',
  EXA: 'EXA_API_KEY',
  STABILITY: 'STABILITY_API_KEY',
  FAL: 'FAL_API_KEY',
  ELEVENLABS: 'ELEVENLABS_API_KEY',
  RUNWAY: 'RUNWAY_API_KEY',
  KLING: 'KLING_API_KEY',
  PIXVERSE: 'PIXVERSE_API_KEY',
  VEO: 'GOOGLE_VEO_API_KEY',
  AGNES: 'AGNES_API_KEY',
};

export const MODEL_ENV_BY_PROVIDER: Record<string, string> = {
  GEMINI: 'GEMINI_MODEL',
  OPENAI: 'OPENAI_MODEL',
  CLAUDE: 'ANTHROPIC_MODEL',
  GROQ: 'GROQ_MODEL',
  DEEPSEEK: 'DEEPSEEK_MODEL',
  MISTRAL: 'MISTRAL_MODEL',
  XAI: 'XAI_MODEL',
  COHERE: 'COHERE_MODEL',
  OPENROUTER: 'OPENROUTER_MODEL',
  TOGETHER: 'TOGETHER_MODEL',
  CEREBRAS: 'CEREBRAS_MODEL',
  FIREWORKS: 'FIREWORKS_MODEL',
  QWEN: 'QWEN_MODEL',
  HUGGINGFACE: 'HUGGINGFACE_MODEL',
};

/** OpenAI-compatible providers share the /v1/chat/completions wire format. */
export function isOpenAICompatible(provider: string): boolean {
  return PROVIDER_CATALOG.some(
    (e) => e.id === provider && e.openAICompatible === true,
  );
}

export function catalogEndpoint(provider: string): string | null {
  return PROVIDER_CATALOG.find((e) => e.id === provider)?.endpoint ?? null;
}
