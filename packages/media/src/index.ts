import { env } from '@avf/config';
import type { ImageProvider, VideoProvider, VoiceProvider } from './types.js';
import { OpenAIImageProvider } from './image/openai.js';
import { MockImageProvider } from './image/mock.js';
import { MockVideoProvider, RunwayVideoProvider } from './video/providers.js';
import {
  ElevenLabsVoiceProvider,
  GoogleVoiceProvider,
  OpenAIVoiceProvider,
} from './voice/providers.js';
import { MockVoiceProvider } from './voice/mock.js';

export function createImageProvider(): ImageProvider {
  switch (env.IMAGE_PROVIDER) {
    case 'OPENAI':
      return new OpenAIImageProvider();
    case 'MOCK':
    default:
      return new MockImageProvider();
  }
}

export function createVideoProvider(): VideoProvider {
  switch (env.VIDEO_PROVIDER) {
    case 'RUNWAY':
      return new RunwayVideoProvider();
    case 'VEO':
    case 'KLING':
      // These are wired through the same interface; without credentials the
      // worker falls back to the mock provider so the pipeline keeps running.
      return new MockVideoProvider();
    case 'MOCK':
    default:
      return new MockVideoProvider();
  }
}

export function createVoiceProvider(): VoiceProvider {
  switch (env.VOICE_PROVIDER) {
    case 'OPENAI':
      return new OpenAIVoiceProvider();
    case 'GOOGLE':
      return new GoogleVoiceProvider();
    case 'ELEVENLABS':
      return new ElevenLabsVoiceProvider();
    case 'MOCK':
    default:
      return new MockVoiceProvider();
  }
}

export type {
  ImageProvider,
  ImageGenerationInput,
  VideoProvider,
  VideoGenerationInput,
  VoiceProvider,
  VoiceGenerationInput,
  VoiceGenerationResult,
  GeneratedAsset,
} from './types.js';
export { MediaProviderError, mediaError, fetchBinary } from './types.js';
export { OpenAIImageProvider } from './image/openai.js';
export { MockImageProvider } from './image/mock.js';
export { MockVideoProvider, RunwayVideoProvider } from './video/providers.js';
export {
  OpenAIVoiceProvider,
  GoogleVoiceProvider,
  ElevenLabsVoiceProvider,
} from './voice/providers.js';
export { MockVoiceProvider } from './voice/mock.js';
