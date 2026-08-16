import { describe, expect, it } from 'vitest';
import {
  selectTopic,
  normalizeText,
  tokenSimilarity,
  jaccardSimilarity,
  isDuplicate,
  findDuplicate,
  filterNonDuplicates,
} from '../src/content.js';

describe('selectTopic', () => {
  const base = { id: '1', name: 'A' };

  it('prefers unused topics', () => {
    const used = { ...base, id: '1', usedCount: 5, lastUsedAt: new Date('2026-01-01') };
    const fresh = { ...base, id: '2', usedCount: 0, lastUsedAt: null };
    const result = selectTopic([used, fresh]);
    expect(result?.topic.id).toBe('2');
  });

  it('prefers the least recently used topic', () => {
    const older = { ...base, id: '1', usedCount: 1, lastUsedAt: new Date('2026-01-01') };
    const newer = { ...base, id: '2', usedCount: 1, lastUsedAt: new Date('2026-02-01') };
    const result = selectTopic([newer, older]);
    expect(result?.topic.id).toBe('1');
  });

  it('breaks ties by lowest usedCount', () => {
    const many = { ...base, id: '1', usedCount: 9, lastUsedAt: new Date('2026-01-01') };
    const few = { ...base, id: '2', usedCount: 2, lastUsedAt: new Date('2026-01-01') };
    const result = selectTopic([many, few]);
    expect(result?.topic.id).toBe('2');
  });

  it('respects cooldown and reports skipped topics', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    const usedToday = { ...base, id: '1', lastUsedAt: new Date('2026-08-15T09:00:00Z') };
    const old = { ...base, id: '2', lastUsedAt: new Date('2026-08-10T00:00:00Z') };
    const result = selectTopic([usedToday, old], { cooldownMs: 5 * 3600 * 1000, now });
    expect(result?.topic.id).toBe('2');
    expect(result?.skippedUsedToday).toBe(1);
  });

  it('returns null when every topic is on cooldown', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    const usedToday = { ...base, id: '1', lastUsedAt: new Date('2026-08-15T09:00:00Z') };
    const result = selectTopic([usedToday], { cooldownMs: 5 * 3600 * 1000, now });
    expect(result).toBeNull();
  });

  it('returns null for an empty pool', () => {
    expect(selectTopic([])).toBeNull();
  });
});

describe('normalizeText / similarity', () => {
  it('normalizes case, diacritics and punctuation', () => {
    expect(normalizeText('  Cà phê, đen! ')).toBe('ca phe den');
  });

  it('computes token overlap similarity', () => {
    expect(tokenSimilarity('The quick brown fox', 'the QUICK brown fox jumps')).toBeCloseTo(0.8);
    expect(tokenSimilarity('a b c', 'd e f')).toBe(0);
  });

  it('computes jaccard similarity', () => {
    expect(jaccardSimilarity('a b c', 'a b c d')).toBeCloseTo(0.75);
  });
});

describe('duplicate detection', () => {
  it('flags identical topics as duplicates', () => {
    expect(isDuplicate('Cách làm bánh mì tại nhà', 'Cách làm bánh mì tại nhà')).toBe(true);
  });

  it('flags near-identical topics with punctuation noise', () => {
    expect(isDuplicate('Cách làm bánh mì tại nhà!', 'cach lam banh mi tai nha')).toBe(true);
  });

  it('does not flag distinct topics', () => {
    expect(isDuplicate('Cách làm bánh mì', 'Top 10 điện thoại rẻ')).toBe(false);
  });

  it('finds the first duplicate and filters non-duplicates', () => {
    const existing = ['Topic A', 'Topic B'];
    expect(findDuplicate('topic a', existing)).toBe('Topic A');
    const filtered = filterNonDuplicates(['Topic A', 'New Topic C'], existing);
    expect(filtered).toEqual(['New Topic C']);
  });
});
