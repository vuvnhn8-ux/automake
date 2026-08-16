import { env } from '@avf/config';
import type {
  GeneratedAsset,
  VoiceGenerationInput,
  VoiceGenerationResult,
  VoiceProvider,
} from '../types.js';
import { mediaError } from '../types.js';

export class OpenAIVoiceProvider implements VoiceProvider {
  readonly name = 'OPENAI' as const;
  readonly model: string;

  constructor(model?: string) {
    this.model = model ?? env.OPENAI_TTS_MODEL;
  }

  async generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: input.text,
        voice: input.voice ?? env.OPENAI_TTS_VOICE,
        speed: input.speed ?? 1,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw mediaError('PROVIDER_ERROR', this.name, `OpenAI TTS HTTP ${response.status}: ${raw.slice(0, 200)}`, true);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      data: buffer,
      mimeType: 'audio/mp3',
      provider: this.name,
      model: this.model,
      metadata: { language: input.language, voice: input.voice },
    };
  }
}

export class GoogleVoiceProvider implements VoiceProvider {
  readonly name = 'GOOGLE' as const;
  readonly model = 'google-cloud-tts';

  async generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'GEMINI_API_KEY is required for Google TTS');
    }
    const voice = input.voice ?? env.GOOGLE_TTS_VOICE;
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: input.text },
          voice: { languageCode: input.language ?? 'vi-VN', name: voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: input.speed ?? 1,
            pitch: input.pitch ?? 0,
          },
        }),
      },
    );
    const raw = await response.text();
    if (!response.ok) {
      throw mediaError('PROVIDER_ERROR', this.name, `Google TTS HTTP ${response.status}: ${raw.slice(0, 200)}`, true);
    }
    let json: { audioContent?: string };
    try {
      json = JSON.parse(raw);
    } catch {
      throw mediaError('PROVIDER_ERROR', this.name, 'Google TTS returned invalid JSON');
    }
    if (!json.audioContent) {
      throw mediaError('PROVIDER_ERROR', this.name, 'Google TTS returned no audio');
    }
    return {
      data: Buffer.from(json.audioContent, 'base64'),
      mimeType: 'audio/mp3',
      provider: this.name,
      model: this.model,
      metadata: { voice, language: input.language },
    };
  }
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = 'ELEVENLABS' as const;
  readonly model = 'eleven_multilingual_v2';

  async generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    const apiKey = env.ELEVENLABS_API_KEY;
    const voiceId = env.ELEVENLABS_VOICE_ID;
    if (!apiKey) {
      throw mediaError('AUTH_ERROR', this.name, 'ELEVENLABS_API_KEY is not configured');
    }
    if (!voiceId) {
      throw mediaError('INVALID_REQUEST', this.name, 'ELEVENLABS_VOICE_ID is not configured');
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: input.text,
          model_id: this.model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: input.speed ?? 1 },
        }),
      },
    );
    if (!response.ok) {
      const raw = await response.text();
      throw mediaError('PROVIDER_ERROR', this.name, `ElevenLabs HTTP ${response.status}: ${raw.slice(0, 200)}`, true);
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: 'audio/mpeg',
      provider: this.name,
      model: this.model,
      metadata: { voiceId },
    };
  }
}
