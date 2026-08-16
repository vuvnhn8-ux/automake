import type {
  VoiceGenerationInput,
  VoiceGenerationResult,
  VoiceProvider,
} from '../types.js';

/**
 * Generates a deterministic, valid WAV file locally — no external service.
 * Used in dev/tests and as a fallback so voice + rendering can be exercised.
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'MOCK' as const;
  readonly model = 'mock-tts-v1';

  async generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    const rate = 22050;
    const durationSeconds = Math.max(1, Math.round(input.text.length / 16));
    const samples = rate * durationSeconds;
    const dataSize = samples * 2;

    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // fmt chunk size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(rate, 24);
    buffer.writeUInt32LE(rate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const seed = hash(input.text);
    for (let i = 0; i < samples; i++) {
      const t = i / rate;
      const freq = 140 + (seed % 120);
      const envelope = 0.35 + 0.2 * Math.sin(2 * Math.PI * t * 2);
      const sample = Math.round(
        Math.sin(2 * Math.PI * freq * t + (seed % 7)) * 0.3 * envelope * 32767,
      );
      buffer.writeInt16LE(sample, 44 + i * 2);
    }

    return {
      data: buffer,
      mimeType: 'audio/wav',
      provider: this.name,
      model: this.model,
      durationSeconds,
      metadata: { language: input.language, sampleRate: rate },
    };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}
