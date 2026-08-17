import { describe, expect, it } from 'vitest';
import { mergeProjectConfig } from '../src/lib/project-config.js';

describe('mergeProjectConfig — section isolation', () => {
  it('merges content patch without wiping video keys', () => {
    const existing = {
      contentTheme: 'old theme',
      keywords: ['a'],
      aspectRatio: '9:16',
      resolution: '1080x1920',
      visualStyle: 'cinematic',
    };
    const merged = mergeProjectConfig(existing, {
      contentTheme: 'new theme',
      keywords: ['b', 'c'],
      contentInstructions: 'write well',
    });
    expect(merged.contentTheme).toBe('new theme');
    expect(merged.keywords).toEqual(['b', 'c']);
    expect(merged.contentInstructions).toBe('write well');
    expect(merged.aspectRatio).toBe('9:16');
    expect(merged.resolution).toBe('1080x1920');
    expect(merged.visualStyle).toBe('cinematic');
  });

  it('merges video patch without wiping content keys', () => {
    const existing = {
      contentTheme: 'life lessons',
      keywords: ['karma'],
      targetAudience: 'adults',
      aspectRatio: '9:16',
    };
    const merged = mergeProjectConfig(existing, {
      aspectRatio: '16:9',
      durationTarget: 45,
      imageStyle: 'realistic',
    });
    expect(merged.contentTheme).toBe('life lessons');
    expect(merged.keywords).toEqual(['karma']);
    expect(merged.targetAudience).toBe('adults');
    expect(merged.aspectRatio).toBe('16:9');
    expect(merged.durationTarget).toBe(45);
    expect(merged.imageStyle).toBe('realistic');
  });

  it('starts from empty when existing config is null', () => {
    const merged = mergeProjectConfig(null, { contentTheme: 'fresh' });
    expect(merged).toEqual({ contentTheme: 'fresh' });
  });

  it('ignores undefined patch values so omitted fields stay', () => {
    const existing = { contentTheme: 'keep', aspectRatio: '9:16' };
    const merged = mergeProjectConfig(existing, {
      contentTheme: 'updated',
      aspectRatio: undefined,
    });
    expect(merged.contentTheme).toBe('updated');
    expect(merged.aspectRatio).toBe('9:16');
  });

  it('allows empty string overwrite (clear field) without dropping siblings', () => {
    const existing = { contentTheme: 'x', avoid: 'violence', aspectRatio: '9:16' };
    const merged = mergeProjectConfig(existing, { avoid: '' });
    expect(merged.avoid).toBe('');
    expect(merged.contentTheme).toBe('x');
    expect(merged.aspectRatio).toBe('9:16');
  });

  it('does not mutate the original existing object', () => {
    const existing = { contentTheme: 'a', aspectRatio: '9:16' };
    const copy = { ...existing };
    mergeProjectConfig(existing, { contentTheme: 'b' });
    expect(existing).toEqual(copy);
  });
});
