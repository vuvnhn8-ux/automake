import type { ResearchProvider, ResearchRequest, SearchSource } from './types.js';
import { toResearchSources } from './types.js';
import type { ResearchResult } from '@avf/shared';

/** Generates plausible-sounding but clearly labeled synthetic research for dev. */
export class MockResearchProvider implements ResearchProvider {
  readonly name = 'MOCK' as const;

  async research(req: ResearchRequest): Promise<ResearchResult> {
    const sources: SearchSource[] = Array.from(
      { length: Math.min(req.maxSources ?? 3, 5) },
      (_, i) => ({
        title: `${req.topic} — reference ${i + 1} (mock)`,
        url: `https://example.com/topics/${encodeURIComponent(req.topic)}-${i + 1}`,
        publishedAt: new Date().toISOString(),
        summary: `Synthetic summary ${i + 1} for "${req.topic}". Replace RESEARCH_PROVIDER with TAVILY or EXA for real sources.`,
      }),
    );

    return {
      topic: req.topic,
      overview: `Mock research overview for topic "${req.topic}". No real web sources were consulted.`,
      sources: toResearchSources(sources),
      keyPoints: req.keywords ?? [],
      updatedAt: new Date().toISOString(),
    };
  }
}
