// ---------------------------------------------------------------------------
// Content strategy helpers: topic selection + duplicate protection.
// Pure functions, no DB access — used by the API, worker and tests.
// ---------------------------------------------------------------------------

export interface TopicCandidate {
  id: string;
  name: string;
  usedCount?: number;
  lastUsedAt?: Date | string | null;
}

export interface TopicSelectionResult {
  topic: TopicCandidate;
  /** Number of candidate topics that were skipped because they were used today. */
  skippedUsedToday: number;
}

/**
 * Picks the "least recently used" active topic from a pool:
 * unused topics first, then oldest lastUsedAt, then lowest usedCount.
 * Never returns a topic whose lastUsedAt is within the `cooldownMs` window.
 */
export function selectTopic(
  topics: TopicCandidate[],
  opts: { cooldownMs?: number; now?: Date } = {},
): TopicSelectionResult | null {
  const now = opts.now ?? new Date();
  const cooldown = opts.cooldownMs ?? 0;

  const available = topics.filter((t) => {
    if (cooldown <= 0) return true;
    if (!t.lastUsedAt) return true;
    const usedAt = t.lastUsedAt instanceof Date ? t.lastUsedAt : new Date(t.lastUsedAt);
    return now.getTime() - usedAt.getTime() >= cooldown;
  });

  const skippedUsedToday = topics.length - available.length;
  if (available.length === 0) return null;

  const sorted = [...available].sort((a, b) => {
    const aUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    return (a.usedCount ?? 0) - (b.usedCount ?? 0);
  });

  return { topic: sorted[0]!, skippedUsedToday };
}

/**
 * Normalizes text for comparison: lowercase, strip diacritics + punctuation,
 * collapse whitespace. Used for topic/title/script duplicate detection.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token overlap similarity in [0, 1]. 1 = identical token sets.
 * Returns 0 when either side has no tokens.
 */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return intersection / Math.max(setA.size, setB.size);
}

/**
 * Jaccard-style similarity treating every token as an element.
 * Used as a stricter fallback when the two strings share few unique tokens.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  const union = new Set([...setA, ...setB]);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return intersection / union.size;
}

/**
 * True when `candidate` is too similar to `existing`.
 * Compares both token overlap and jaccard against a threshold.
 */
export function isDuplicate(
  candidate: string,
  existing: string,
  threshold = 0.85,
): boolean {
  if (!candidate.trim() || !existing.trim()) return false;
  return tokenSimilarity(candidate, existing) >= threshold;
}

/**
 * Returns the first entry in `existing` that is a duplicate of `candidate`,
 * or null when none match.
 */
export function findDuplicate(
  candidate: string,
  existing: string[],
  threshold = 0.85,
): string | null {
  for (const item of existing) {
    if (isDuplicate(candidate, item, threshold)) return item;
  }
  return null;
}

/** Filters `candidates` down to those that are NOT duplicates of `existing`. */
export function filterNonDuplicates(
  candidates: string[],
  existing: string[],
  threshold = 0.85,
): string[] {
  return candidates.filter((c) => findDuplicate(c, existing, threshold) === null);
}
