import type { ResearchResult, ResearchSource } from '@avf/shared';

export type ResearchProviderName = 'MOCK' | 'TAVILY' | 'EXA';

export interface ResearchRequest {
  topic: string;
  keywords?: string[];
  language?: string;
  maxSources?: number;
}

export interface ResearchProvider {
  readonly name: ResearchProviderName;
  research(req: ResearchRequest): Promise<ResearchResult>;
}

export interface SearchSource {
  title: string;
  url: string;
  publishedAt?: string | null;
  summary: string;
}

/** Normalize raw search hits into ResearchSource records with defaults. */
export function toResearchSources(hits: SearchSource[]): ResearchSource[] {
  return hits.map((h) => ({
    title: h.title,
    url: h.url,
    publishedAt: h.publishedAt ?? null,
    summary: h.summary,
  }));
}
