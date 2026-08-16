import { env } from '@avf/config';
import type { ResearchProvider, ResearchRequest, SearchSource } from './types.js';
import { toResearchSources } from './types.js';
import { AIErrorCode, fetchWithTimeout, providerError } from '../types.js';
import type { ResearchResult } from '@avf/shared';

interface TavilyResponse {
  results?: { title?: string; url?: string; published_date?: string | null; content?: string }[];
  answer?: string;
}

/**
 * Tavily search API  Ereal web research provider.
 * Requires TAVILY_API_KEY. Results carry real source URLs (never fabricated).
 */
export class TavilyResearchProvider implements ResearchProvider {
  readonly name = 'TAVILY' as const;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env.TAVILY_API_KEY;
  }

  async research(req: ResearchRequest): Promise<ResearchResult> {
    if (!this.apiKey) {
      throw providerError(AIErrorCode.AUTH_ERROR, 'TAVILY', 'TAVILY_API_KEY is not configured');
    }

    const query = [req.topic, ...(req.keywords ?? [])].join(' ');
    const response = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: req.maxSources ?? 5,
          search_depth: 'basic',
          include_answer: true,
        }),
      },
      30000,
    );

    const raw = await response.text();
    if (!response.ok) {
      throw providerError(AIErrorCode.PROVIDER_ERROR, this.name, `Tavily HTTP ${response.status}: ${raw.slice(0, 200)}`);
    }

    let json: TavilyResponse;
    try {
      json = JSON.parse(raw);
    } catch {
      throw providerError(AIErrorCode.PROVIDER_ERROR, this.name, 'Tavily returned invalid JSON');
    }

    const sources: SearchSource[] = (json.results ?? []).map((r) => ({
      title: r.title ?? 'Untitled',
      url: r.url ?? '',
      publishedAt: r.published_date ?? null,
      summary: r.content ?? '',
    }));

    return {
      topic: req.topic,
      overview: json.answer ?? sources.map((s) => s.summary).join(' ').slice(0, 800),
      sources: toResearchSources(sources),
      keyPoints: (json.results ?? []).map((r) => r.title ?? '').filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
  }
}
