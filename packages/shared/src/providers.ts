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

export const KEY_ENV_BY_PROVIDER: Record<string, string> = {
  GEMINI: 'GEMINI_API_KEY',
  OPENAI: 'OPENAI_API_KEY',
  CLAUDE: 'ANTHROPIC_API_KEY',
  TAVILY: 'TAVILY_API_KEY',
  EXA: 'EXA_API_KEY',
  ELEVENLABS: 'ELEVENLABS_API_KEY',
  RUNWAY: 'RUNWAY_API_KEY',
  KLING: 'KLING_API_KEY',
  VEO: 'GOOGLE_VEO_API_KEY',
};

export const MODEL_ENV_BY_PROVIDER: Record<string, string> = {
  GEMINI: 'GEMINI_MODEL',
  OPENAI: 'OPENAI_MODEL',
  CLAUDE: 'ANTHROPIC_MODEL',
};
