import { describe, expect, it } from 'vitest';
import {
  ContentPromptBuilder,
  buildTopicSuggestionPrompt,
  PLATFORM_RULES,
} from '../src/content-prompt.js';

describe('ContentPromptBuilder', () => {
  it('orders context sections as documented', () => {
    const builder = new ContentPromptBuilder();
    const { system, user } = builder.build({
      channel: {
        name: 'TechDaily',
        description: 'Daily tech news',
        audience: 'Gen Z',
        language: 'vi-VN',
        tone: 'ENERGETIC',
        keywords: ['ai', 'gadgets'],
        excludedTopics: ['politics'],
        hashtags: ['#tech'],
        cta: 'Follow for more',
        contentRules: { requireCTA: true, allowOpinion: false },
      },
      series: { name: 'Today in AI', instructions: 'Keep it 60s.' },
      topic: { name: 'New AI model', description: 'A fresh model', keywords: ['llm'] },
      knowledge: [{ title: 'Facts', content: 'The model has 7B params.' }],
      previousContent: [{ title: 'Old video about AI model', topic: 'AI model' }],
      platform: 'YOUTUBE',
      language: 'vi-VN',
      durationSeconds: 45,
    });

    expect(system).toContain('Return ONLY a JSON object');
    const sections = user.split('## ');
    expect(sections[1]).toMatch(/^CHANNEL CONTENT PROFILE/);
    expect(sections[2]).toMatch(/^CONTENT SERIES/);
    expect(sections[3]).toMatch(/^TOPIC/);
    expect(sections[4]).toMatch(/^KNOWLEDGE BASE/);
    expect(sections[5]).toMatch(/^PREVIOUS CONTENT/);
    expect(sections[6]).toMatch(/^PLATFORM RULES/);
    expect(sections[7]).toMatch(/^GENERATION/);

    expect(user).toContain('Channel name: TechDaily');
    expect(user).toContain('Series: Today in AI');
    expect(user).toContain('Topic: New AI model');
    expect(user).toContain('Facts');
    expect(user).toContain('do not repeat');
  });

  it('applies platform rules to the system prompt', () => {
    const builder = new ContentPromptBuilder();
    const tiktok = builder.build({ platform: 'TIKTOK' });
    expect(tiktok.system).toContain('TikTok');
    expect(tiktok.system).toContain(`at most ${PLATFORM_RULES.TIKTOK!.hashtagMaxCount} hashtags`);

    const fb = builder.build({ platform: 'FACEBOOK' });
    expect(fb.system).toContain('Facebook');
    expect(fb.system).toContain(`at most ${PLATFORM_RULES.FACEBOOK!.captionMaxLength} characters`);
  });

  it('falls back to OTHER rules for unknown platforms', () => {
    const builder = new ContentPromptBuilder();
    const { system } = builder.build({ platform: 'SNAPCHAT' });
    expect(system).toContain('Generic social');
  });

  it('includes content rules flags when provided', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({
      channel: {
        name: 'X',
        contentRules: { requireCTA: true, allowStatistics: true, minScriptLength: 200, maxVideoDuration: 90 },
      },
    });
    expect(user).toContain('Require CTA: true');
    expect(user).toContain('Allow statistics: true');
    expect(user).toContain('Minimum script length: 200');
    expect(user).toContain('Maximum video duration: 90');
  });

  it('omits empty sections when no data is provided', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({});
    expect(user).not.toContain('CHANNEL CONTENT PROFILE');
    expect(user).not.toContain('KNOWLEDGE BASE');
    expect(user).toContain('PLATFORM RULES');
  });
});

describe('buildTopicSuggestionPrompt', () => {
  it('asks for unique topics based on profile + existing topics + previous content', () => {
    const { system, user } = buildTopicSuggestionPrompt({
      channel: { name: 'TechDaily', audience: 'Gen Z' },
      series: { name: 'Today in AI' },
      existingTopics: ['New AI model'],
      previousContent: [{ title: 'Old video' }],
      count: 8,
      language: 'vi-VN',
    });
    expect(system).toContain('Propose 8 new, non-duplicate video topics');
    expect(user).toContain('## CHANNEL PROFILE');
    expect(user).toContain('## SERIES');
    expect(user).toContain('## EXISTING TOPICS (avoid these)');
    expect(user).toContain('New AI model');
    expect(user).toContain('## PREVIOUS VIDEOS (avoid repeating these)');
    expect(user).toContain('Old video');
    expect(system).toContain('vi-VN');
  });
});
