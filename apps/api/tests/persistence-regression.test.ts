import { describe, expect, it } from 'vitest';
import { mergeProjectConfig } from '../src/lib/project-config.js';

describe('PERSISTENCE REGRESSION — mergeProjectConfig section isolation', () => {
  it('Content tab save never wipes video keys', () => {
    const base = {
      contentTheme: 'ancient wisdom',
      keywords: ['buddha'],
      contentInstructions: 'Story-focused',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      imageStyle: 'watercolor',
      durationTarget: 30,
      visualStyle: 'cinematic',
      videoInstructions: 'Keep it calm',
    };
    const contentPatch = {
      contentTheme: 'modern spirituality',
      keywords: ['meditation', 'mindfulness'],
      contentInstructions: 'Short and punchy',
    };
    const merged = mergeProjectConfig(base, contentPatch);
    expect(merged.contentTheme).toBe('modern spirituality');
    expect(merged.keywords).toEqual(['meditation', 'mindfulness']);
    expect(merged.contentInstructions).toBe('Short and punchy');
    expect(merged.aspectRatio).toBe('9:16');
    expect(merged.resolution).toBe('1080x1920');
    expect(merged.imageStyle).toBe('watercolor');
    expect(merged.durationTarget).toBe(30);
    expect(merged.visualStyle).toBe('cinematic');
    expect(merged.videoInstructions).toBe('Keep it calm');
  });

  it('Video tab save never wipes content keys', () => {
    const base = {
      contentTheme: 'life lessons',
      keywords: ['karma'],
      contentInstructions: 'Deep',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      imageStyle: 'watercolor',
      durationTarget: 30,
    };
    const videoPatch = {
      aspectRatio: '16:9',
      resolution: '1920x1080',
      imageStyle: 'realistic',
      durationTarget: 60,
      visualStyle: 'documentary',
      videoInstructions: 'Fast cuts',
    };
    const merged = mergeProjectConfig(base, videoPatch);
    expect(merged.contentTheme).toBe('life lessons');
    expect(merged.keywords).toEqual(['karma']);
    expect(merged.contentInstructions).toBe('Deep');
    expect(merged.aspectRatio).toBe('16:9');
    expect(merged.resolution).toBe('1920x1080');
    expect(merged.imageStyle).toBe('realistic');
    expect(merged.durationTarget).toBe(60);
    expect(merged.visualStyle).toBe('documentary');
    expect(merged.videoInstructions).toBe('Fast cuts');
  });

  it('AI provider tab save never wipes content or video keys', () => {
    const base = {
      contentTheme: 'x',
      aspectRatio: '9:16',
      defaultAIProvider: 'gemini',
      defaultImageProvider: 'mock',
    };
    const aiPatch = {
      defaultAIProvider: 'claude',
      defaultImageProvider: 'openai',
    };
    const merged = mergeProjectConfig(base, aiPatch);
    expect(merged.contentTheme).toBe('x');
    expect(merged.aspectRatio).toBe('9:16');
    expect(merged.defaultAIProvider).toBe('claude');
    expect(merged.defaultImageProvider).toBe('openai');
  });

  it('nulling an AI provider (setting to null) preserves sibling fields', () => {
    const base = {
      contentTheme: 'keep me',
      defaultAIProvider: 'gemini',
      defaultImageProvider: 'openai',
    };
    const merged = mergeProjectConfig(base, { defaultAIProvider: null });
    expect(merged.contentTheme).toBe('keep me');
    expect(merged.defaultAIProvider).toBeNull();
    expect(merged.defaultImageProvider).toBe('openai');
  });

  it('empty string clears field without dropping siblings', () => {
    const base = { contentTheme: 'x', avoid: 'violence', aspectRatio: '9:16' };
    const merged = mergeProjectConfig(base, { avoid: '' });
    expect(merged.avoid).toBe('');
    expect(merged.contentTheme).toBe('x');
    expect(merged.aspectRatio).toBe('9:16');
  });

  it('starting from empty config produces only patch fields', () => {
    const merged = mergeProjectConfig(null, { contentTheme: 'fresh start' });
    expect(merged).toEqual({ contentTheme: 'fresh start' });
  });

  it('undefined patch values are skipped — siblings stay', () => {
    const base = { contentTheme: 'a', aspectRatio: '9:16' };
    const merged = mergeProjectConfig(base, {
      contentTheme: 'b',
      aspectRatio: undefined,
    });
    expect(merged.contentTheme).toBe('b');
    expect(merged.aspectRatio).toBe('9:16');
  });

  it('original object is never mutated', () => {
    const original = { contentTheme: 'x', aspectRatio: '9:16' };
    const copy = { ...original };
    mergeProjectConfig(original, { contentTheme: 'y' });
    expect(original).toEqual(copy);
  });
});

describe('PERSISTENCE REGRESSION — mergeProjectConfig Content/Video realistic scenario', () => {
  it('Content → Video → Content round-trip preserves all keys', () => {
    let config: unknown = null;

    // User saves Content tab
    config = mergeProjectConfig(config, {
      contentTheme: 'Stoic Philosophy',
      keywords: ['stoicism', 'marcus aurelius'],
      contentInstructions: 'Narrative style',
      targetAudience: 'Young men 18-30',
    });

    // User saves Video tab
    config = mergeProjectConfig(config, {
      aspectRatio: '9:16',
      resolution: '1080x1920',
      imageStyle: 'realistic',
      durationTarget: 30,
      visualStyle: 'cinematic',
    });

    // User saves Content tab again with a tweak
    config = mergeProjectConfig(config, {
      contentTheme: 'Stoic Philosophy Vol. 2',
      keywords: ['stoicism', 'epictetus'],
      contentInstructions: 'Narrative style with quotes',
      targetAudience: 'Young men 18-30',
    });

    // Video keys must still be present
    expect(config).toEqual({
      contentTheme: 'Stoic Philosophy Vol. 2',
      keywords: ['stoicism', 'epictetus'],
      contentInstructions: 'Narrative style with quotes',
      targetAudience: 'Young men 18-30',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      imageStyle: 'realistic',
      durationTarget: 30,
      visualStyle: 'cinematic',
    });
  });
});
