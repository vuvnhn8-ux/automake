import { z } from 'zod';

// ---------------------------------------------------------------------------
// ContentPromptBuilder — builds the full AI generation context for a video.
//
// Context order (from docs / feature spec):
//   Global System Instructions
//     -> Channel Content Profile
//     -> Content Series
//     -> Topic
//     -> Knowledge Base
//     -> Previous Content
//     -> Platform Rules
//     -> AI Generation
// ---------------------------------------------------------------------------

export interface ChannelProfileInput {
  name?: string | null;
  description?: string | null;
  audience?: string | null;
  language?: string | null;
  tone?: string | null;
  contentStyle?: string | null;
  videoStyle?: string | null;
  defaultDurationSeconds?: number | null;
  defaultTemplate?: string | null;
  aiInstructions?: string | null;
  contentRules?: Record<string, unknown> | null;
  excludedTopics?: string[] | null;
  keywords?: string[] | null;
  hashtags?: string[] | null;
  cta?: string | null;
}

export interface SeriesInput {
  name?: string | null;
  description?: string | null;
  instructions?: string | null;
  keywords?: string[] | null;
  excludedTopics?: string[] | null;
  language?: string | null;
  tone?: string | null;
  durationSeconds?: number | null;
  frequencyPerDay?: number | null;
  priority?: number | null;
}

export interface TopicInput {
  name: string;
  description?: string | null;
  keywords?: string[] | null;
}

export interface KnowledgeInput {
  title?: string | null;
  content?: string | null;
  url?: string | null;
}

export interface PreviousContentInput {
  title?: string | null;
  topic?: string | null;
  summary?: string | null;
}

/** Campaign-level content strategy (single source of truth for campaign flow). */
export interface CampaignProfileInput {
  name?: string | null;
  description?: string | null;
  audience?: string | null;
  language?: string | null;
  tone?: string | null;
  contentStyle?: string | null;
  keywords?: string[] | null;
  excludedTopics?: string[] | null;
  cta?: string | null;
  aiInstructions?: string | null;
  contentRules?: Record<string, unknown> | null;
}

/** Per-destination override (wins over the campaign config). */
export interface AssignmentOverrideInput {
  language?: string | null;
  captionInstructions?: string | null;
  voice?: { voiceProvider?: string | null; voiceId?: string | null; gender?: string | null; emotion?: string | null; style?: string | null; speed?: number | null; pitch?: number | null } | null;
}

export interface BuildPromptInput {
  /** Project defaults (lowest campaign layer). */
  project?: { language?: string | null } | null;
  /** Campaign content strategy. */
  campaign?: CampaignProfileInput | null;
  /** Per-channel assignment override. */
  assignment?: AssignmentOverrideInput | null;
  /** Legacy channel-scoped content profile (channel flow only). */
  channel?: ChannelProfileInput | null;
  series?: SeriesInput | null;
  topic?: TopicInput | null;
  knowledge?: KnowledgeInput[] | null;
  previousContent?: PreviousContentInput[] | null;
  platform?: string | null;
  language?: string | null;
  durationSeconds?: number | null;
  requestId?: string;
}

export interface PlatformRules {
  platform: string;
  captionMaxLength?: number;
  hashtagMaxCount?: number;
  titleMaxLength?: number;
  descriptionMaxLength?: number;
  notes?: string;
}

/** Platform-specific limits used to shape captions/hashtags/titles. */
export const PLATFORM_RULES: Record<string, PlatformRules> = {
  FACEBOOK: {
    platform: 'Facebook',
    captionMaxLength: 2200,
    hashtagMaxCount: 30,
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
  },
  YOUTUBE: {
    platform: 'YouTube Shorts',
    captionMaxLength: 500,
    hashtagMaxCount: 15,
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
  },
  TIKTOK: {
    platform: 'TikTok',
    captionMaxLength: 2200,
    hashtagMaxCount: 5,
    titleMaxLength: 100,
  },
  INSTAGRAM: {
    platform: 'Instagram Reels',
    captionMaxLength: 2200,
    hashtagMaxCount: 30,
    titleMaxLength: 100,
  },
  OTHER: {
    platform: 'Generic social',
    captionMaxLength: 2200,
    hashtagMaxCount: 30,
    titleMaxLength: 100,
  },
};

function list(items?: string[] | null): string {
  return (items ?? []).filter((x) => x?.trim()).join(', ');
}

/**
 * Builds the system + user prompts for generating a video script/scenes.
 * The builder is pure (no DB, no provider) so it is easy to unit test.
 */
export class ContentPromptBuilder {
  platformRules(platform?: string | null): PlatformRules {
    const key = (platform ?? '').toUpperCase();
    return PLATFORM_RULES[key] ?? PLATFORM_RULES.OTHER!;
  }

  buildSystem(input: BuildPromptInput): string {
    const rules = this.platformRules(input.platform);
    const lines = [
      'You are an expert short-form video scriptwriter and content strategist.',
      'You produce vertical (9:16) short videos optimized for audience retention.',
      'Return ONLY a JSON object with this exact shape:',
      '{"title": string, "hook": string, "script": string (full narration, no markdown), "scenes": [{"order": int, "duration": int (3-10s), "narration": string, "visualPrompt": string (detailed visual description), "subtitle": string}], "caption": string, "hashtags": string[]}',
      `Target platform: ${rules.platform}.`,
      `Caption must be at most ${rules.captionMaxLength ?? 2200} characters.`,
      `Use at most ${rules.hashtagMaxCount ?? 30} hashtags.`,
      rules.notes ? rules.notes : '',
      'Scenes must cover the whole script, order starting at 1.',
      'Always follow the campaign profile, series instructions, and knowledge base below.',
      'Never invent facts: if a statistic is used it must come from the provided knowledge base or research notes.',
      'Avoid topics listed in excludedTopics. Do not use clickbait that promises false information.',
      'If requireCTA is set, end the caption with a call-to-action matching the channel CTA.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  /** Builds the user/context prompt in the documented order. */
  buildUser(input: BuildPromptInput): string {
    const sections: string[] = [];

    // 0. Project defaults
    if (input.project?.language) {
      sections.push('## PROJECT DEFAULTS\n' + `Project language: ${input.project.language}`);
    }

    // 0b. Campaign profile (content strategy)
    if (input.campaign) {
      const c = input.campaign;
      const rules = c.contentRules ?? {};
      const profileLines = [
        `Campaign: ${c.name ?? 'Untitled campaign'}`,
        c.description ? `Description: ${c.description}` : '',
        c.audience ? `Audience: ${c.audience}` : '',
        c.language ? `Campaign language: ${c.language}` : '',
        c.tone ? `Tone: ${c.tone}` : '',
        c.contentStyle ? `Content style: ${c.contentStyle}` : '',
        c.keywords?.length ? `Campaign keywords: ${list(c.keywords)}` : '',
        c.excludedTopics?.length
          ? `Excluded topics: ${list(c.excludedTopics)}`
          : '',
        c.cta ? `CTA: ${c.cta}` : '',
        typeof rules.requireSource === 'boolean'
          ? `Require source: ${rules.requireSource}`
          : '',
        typeof rules.allowOpinion === 'boolean'
          ? `Allow opinion: ${rules.allowOpinion}`
          : '',
        typeof rules.allowNews === 'boolean'
          ? `Allow news: ${rules.allowNews}`
          : '',
        typeof rules.allowStatistics === 'boolean'
          ? `Allow statistics: ${rules.allowStatistics}`
          : '',
        typeof rules.requireCTA === 'boolean'
          ? `Require CTA: ${rules.requireCTA}`
          : '',
        typeof rules.minScriptLength === 'number'
          ? `Minimum script length: ${rules.minScriptLength} chars`
          : '',
        typeof rules.maxScriptLength === 'number'
          ? `Maximum script length: ${rules.maxScriptLength} chars`
          : '',
        typeof rules.minVideoDuration === 'number'
          ? `Minimum video duration: ${rules.minVideoDuration}s`
          : '',
        typeof rules.maxVideoDuration === 'number'
          ? `Maximum video duration: ${rules.maxVideoDuration}s`
          : '',
        c.aiInstructions ? `AI instructions:\n${c.aiInstructions}` : '',
      ].filter(Boolean);
      sections.push('## CAMPAIGN PROFILE\n' + profileLines.join('\n'));
    }

    // 1. Channel Content Profile (legacy channel-scoped flow)
    if (input.channel) {
      const c = input.channel;
      const rules = input.channel.contentRules ?? {};
      const profileLines = [
        `Channel name: ${c.name ?? 'Untitled channel'}`,
        c.description ? `Description: ${c.description}` : '',
        c.audience ? `Audience: ${c.audience}` : '',
        c.language ? `Channel language: ${c.language}` : '',
        c.tone ? `Tone: ${c.tone}` : '',
        c.contentStyle ? `Content style: ${c.contentStyle}` : '',
        c.videoStyle ? `Video style: ${c.videoStyle}` : '',
        c.defaultDurationSeconds
          ? `Preferred video duration: ${c.defaultDurationSeconds} seconds`
          : '',
        c.keywords?.length ? `Channel keywords: ${list(c.keywords)}` : '',
        c.excludedTopics?.length
          ? `Excluded topics: ${list(c.excludedTopics)}`
          : '',
        c.hashtags?.length ? `Channel hashtags: ${list(c.hashtags)}` : '',
        c.cta ? `CTA: ${c.cta}` : '',
        typeof rules.requireSource === 'boolean'
          ? `Require source: ${rules.requireSource}`
          : '',
        typeof rules.allowOpinion === 'boolean'
          ? `Allow opinion: ${rules.allowOpinion}`
          : '',
        typeof rules.allowNews === 'boolean'
          ? `Allow news: ${rules.allowNews}`
          : '',
        typeof rules.allowStatistics === 'boolean'
          ? `Allow statistics: ${rules.allowStatistics}`
          : '',
        typeof rules.requireCTA === 'boolean'
          ? `Require CTA: ${rules.requireCTA}`
          : '',
        typeof rules.minScriptLength === 'number'
          ? `Minimum script length: ${rules.minScriptLength} chars`
          : '',
        typeof rules.maxScriptLength === 'number'
          ? `Maximum script length: ${rules.maxScriptLength} chars`
          : '',
        typeof rules.minVideoDuration === 'number'
          ? `Minimum video duration: ${rules.minVideoDuration}s`
          : '',
        typeof rules.maxVideoDuration === 'number'
          ? `Maximum video duration: ${rules.maxVideoDuration}s`
          : '',
        c.aiInstructions ? `AI instructions:\n${c.aiInstructions}` : '',
      ].filter(Boolean);
      sections.push('## CHANNEL CONTENT PROFILE\n' + profileLines.join('\n'));
    }

    // 2. Content Series
    if (input.series) {
      const s = input.series;
      const seriesLines = [
        `Series: ${s.name ?? 'Untitled series'}`,
        s.description ? `Description: ${s.description}` : '',
        s.language ? `Series language: ${s.language}` : '',
        s.tone ? `Series tone: ${s.tone}` : '',
        s.durationSeconds ? `Series target duration: ${s.durationSeconds}s` : '',
        s.frequencyPerDay ? `Series frequency: ${s.frequencyPerDay}/day` : '',
        s.keywords?.length ? `Series keywords: ${list(s.keywords)}` : '',
        s.excludedTopics?.length
          ? `Series excluded topics: ${list(s.excludedTopics)}`
          : '',
        s.instructions ? `Series instructions:\n${s.instructions}` : '',
      ].filter(Boolean);
      sections.push('## CONTENT SERIES\n' + seriesLines.join('\n'));
    }

    // 3. Topic
    if (input.topic) {
      const t = input.topic;
      const topicLines = [
        `Topic: ${t.name}`,
        t.description ? `Topic description: ${t.description}` : '',
        t.keywords?.length ? `Topic keywords: ${list(t.keywords)}` : '',
      ].filter(Boolean);
      sections.push('## TOPIC\n' + topicLines.join('\n'));
    }

    // 4. Knowledge Base (channel-scoped)
    if (input.knowledge?.length) {
      const docs = input.knowledge
        .map((k) => {
          const head = k.title ? `[${k.title}]` : '';
          const body = k.content?.trim() ? k.content.trim() : '';
          const url = k.url?.trim() ? `(${k.url})` : '';
          return [head, url].filter(Boolean).join(' ') + (body ? `\n${body}` : '');
        })
        .join('\n\n');
      sections.push('## KNOWLEDGE BASE\n' + docs);
    }

    // 5. Previous Content (avoid repetition)
    if (input.previousContent?.length) {
      const recent = input.previousContent
        .slice(0, 20)
        .map((p, i) => {
          const parts = [
            p.title ? `title: ${p.title}` : '',
            p.topic ? `topic: ${p.topic}` : '',
            p.summary ? `summary: ${p.summary}` : '',
          ].filter(Boolean);
          return `${i + 1}. ${parts.join(' | ')}`;
        })
        .join('\n');
      sections.push(
        '## PREVIOUS CONTENT (do not repeat)\n' +
          recent +
          '\nCreate content that is clearly distinct from the above.',
      );
    }

    // 5b. Assignment overrides (per-destination, wins over campaign config)
    if (input.assignment) {
      const a = input.assignment;
      const overrideLines = [
        a.language ? `Destination language: ${a.language}` : '',
        a.voice?.voiceProvider ? `Voice provider: ${a.voice.voiceProvider}` : '',
        a.voice?.voiceId ? `Voice: ${a.voice.voiceId}` : '',
        a.voice?.gender ? `Voice gender: ${a.voice.gender}` : '',
        a.voice?.emotion ? `Voice emotion: ${a.voice.emotion}` : '',
        a.voice?.style ? `Voice style: ${a.voice.style}` : '',
        typeof a.voice?.speed === 'number' ? `Voice speed: ${a.voice.speed}` : '',
        typeof a.voice?.pitch === 'number' ? `Voice pitch: ${a.voice.pitch}` : '',
        a.captionInstructions ? `Caption instructions for this destination:\n${a.captionInstructions}` : '',
      ].filter(Boolean);
      if (overrideLines.length) {
        sections.push('## ASSIGNMENT OVERRIDES (this destination)\n' + overrideLines.join('\n'));
      }
    }

    // 6. Platform rules
    const rules = this.platformRules(input.platform);
    sections.push(
      '## PLATFORM RULES\n' +
        `Platform: ${rules.platform}\n` +
        `Caption length <= ${rules.captionMaxLength ?? 2200} chars.\n` +
        `Hashtags <= ${rules.hashtagMaxCount ?? 30}.`,
    );

    // 7. Generation request
    const effectiveLanguage = input.language ?? input.assignment?.language ?? input.campaign?.language;
    const generationLines = [
      input.topic ? `Write a video about: ${input.topic.name}` : 'Write a video for the topic above.',
      input.durationSeconds
        ? `Target duration: ${input.durationSeconds} seconds.`
        : input.channel?.defaultDurationSeconds
          ? `Target duration: ${input.channel.defaultDurationSeconds} seconds.`
          : '',
      effectiveLanguage ? `Write the narration in: ${effectiveLanguage}.` : '',
      'Write the script now.',
    ].filter(Boolean);
    sections.push('## GENERATION\n' + generationLines.join('\n'));

    return sections.join('\n\n');
  }

  build(input: BuildPromptInput): { system: string; user: string } {
    return {
      system: this.buildSystem(input),
      user: this.buildUser(input),
    };
  }
}

// ---------------------------------------------------------------------------
// AI Topic generation
// ---------------------------------------------------------------------------

export const GeneratedTopicSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  keywords: z.array(z.string()).default([]),
});
export type GeneratedTopic = z.infer<typeof GeneratedTopicSchema>;

export const GeneratedTopicsSchema = z.object({
  topics: z.array(GeneratedTopicSchema).min(1).max(20),
});
export type GeneratedTopics = z.infer<typeof GeneratedTopicsSchema>;

export interface SuggestTopicsInput {
  channel?: ChannelProfileInput | null;
  campaign?: CampaignProfileInput | null;
  series?: SeriesInput | null;
  existingTopics?: string[];
  previousContent?: PreviousContentInput[] | null;
  count?: number;
  language?: string | null;
}

export interface SuggestTopicsResult {
  topics: GeneratedTopic[];
  /** Prompt context used (for debugging / preview). */
  context: string;
}

/**
 * Builds the prompt that asks the AI to propose new, non-duplicate topics
 * for a channel/series based on profile + existing topics + previous content.
 */
export function buildTopicSuggestionPrompt(input: SuggestTopicsInput): {
  system: string;
  user: string;
} {
  const count = input.count ?? 10;
  const system = [
    'You are a content strategist for short-form video channels.',
    `Propose ${count} new, non-duplicate video topics that fit the channel and series.`,
    'Topics must be specific, catchy, and different from the existing topic list and previous videos.',
    'Return ONLY a JSON object: {"topics": [{"title": string, "description": string, "keywords": string[]}]}.',
    input.language ? `Write the topics in: ${input.language}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const sections: string[] = [];
  if (input.campaign) {
    const c = input.campaign;
    sections.push(
      '## CAMPAIGN PROFILE\n' +
        [
          c.name ? `Campaign: ${c.name}` : '',
          c.description ? `Description: ${c.description}` : '',
          c.audience ? `Audience: ${c.audience}` : '',
          c.tone ? `Tone: ${c.tone}` : '',
          c.keywords?.length ? `Keywords: ${list(c.keywords)}` : '',
          c.excludedTopics?.length
            ? `Excluded: ${list(c.excludedTopics)}`
            : '',
          c.aiInstructions ? `Instructions: ${c.aiInstructions}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
    );
  }
  if (input.channel) {
    const c = input.channel;
    sections.push(
      '## CHANNEL PROFILE\n' +
        [
          c.name ? `Channel: ${c.name}` : '',
          c.description ? `Description: ${c.description}` : '',
          c.audience ? `Audience: ${c.audience}` : '',
          c.tone ? `Tone: ${c.tone}` : '',
          c.keywords?.length ? `Keywords: ${list(c.keywords)}` : '',
          c.excludedTopics?.length
            ? `Excluded: ${list(c.excludedTopics)}`
            : '',
          c.aiInstructions ? `Instructions: ${c.aiInstructions}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
    );
  }
  if (input.series) {
    const s = input.series;
    sections.push(
      '## SERIES\n' +
        [
          s.name ? `Series: ${s.name}` : '',
          s.description ? `Description: ${s.description}` : '',
          s.keywords?.length ? `Keywords: ${list(s.keywords)}` : '',
          s.instructions ? `Instructions: ${s.instructions}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
    );
  }
  if (input.existingTopics?.length) {
    sections.push('## EXISTING TOPICS (avoid these)\n' + input.existingTopics.join('\n'));
  }
  if (input.previousContent?.length) {
    sections.push(
      '## PREVIOUS VIDEOS (avoid repeating these)\n' +
        input.previousContent
          .slice(0, 20)
          .map((p, i) => `${i + 1}. ${p.title ?? p.topic ?? ''}`)
          .join('\n'),
    );
  }
  sections.push(`Generate ${count} new topics now.`);

  return { system, user: sections.join('\n\n') };
}
