import { describe, expect, it } from 'vitest';
import { ContentPromptBuilder, buildTopicSuggestionPrompt } from '../src/content-prompt.js';

describe('ContentPromptBuilder campaign hierarchy', () => {
  it('orders project defaults, campaign profile, then legacy channel', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({
      project: { language: 'vi-VN' },
      campaign: {
        name: 'AI News',
        description: 'Daily AI updates',
        audience: 'Tech enthusiasts',
        language: 'ja-JP',
        tone: 'professional',
        contentStyle: 'news-style',
        keywords: ['ai', 'ml'],
        excludedTopics: ['politics'],
        cta: 'Follow for daily updates',
        aiInstructions: 'Always cite sources.',
      },
      channel: { name: 'LegacyChannel', language: 'en-US' },
      series: { name: 'Today in AI' },
      topic: { name: 'New model' },
      knowledge: [{ title: 'Docs', content: '7B params.' }],
      previousContent: [{ title: 'Old video' }],
      platform: 'YOUTUBE',
      language: 'ja-JP',
    });

    const sections = user.split('## ');
    expect(sections[1]).toMatch(/^PROJECT DEFAULTS/);
    expect(sections[2]).toMatch(/^CAMPAIGN PROFILE/);
    expect(sections[3]).toMatch(/^CHANNEL CONTENT PROFILE/);
    expect(sections[4]).toMatch(/^CONTENT SERIES/);
    expect(sections[5]).toMatch(/^TOPIC/);
    expect(sections[6]).toMatch(/^KNOWLEDGE BASE/);
    expect(sections[7]).toMatch(/^PREVIOUS CONTENT/);
    expect(sections[8]).toMatch(/^PLATFORM RULES/);
    expect(sections[9]).toMatch(/^GENERATION/);

    expect(user).toContain('Campaign: AI News');
    expect(user).toContain('Campaign language: ja-JP');
    expect(user).toContain('AI instructions:\nAlways cite sources.');
    expect(user).toContain('Write the narration in: ja-JP.');
  });

  it('lets the assignment override win over campaign language', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({
      campaign: { name: 'Camp', language: 'ja-JP' },
      assignment: { language: 'en-US' },
    });
    expect(user).toContain('Destination language: en-US');
    expect(user).toContain('Write the narration in: en-US.');
  });

  it('includes assignment voice + caption instructions after previous content', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({
      campaign: { name: 'Camp' },
      previousContent: [{ title: 'Old' }],
      assignment: {
        voice: { voiceProvider: 'ELEVENLABS', voiceId: 'rachel', gender: 'FEMALE', speed: 1.1 },
        captionInstructions: 'Add source links.',
      },
    });

    const sections = user.split('## ');
    const overrideIndex = sections.findIndex((s) => s.startsWith('ASSIGNMENT OVERRIDES'));
    const previousIndex = sections.findIndex((s) => s.startsWith('PREVIOUS CONTENT'));
    const platformIndex = sections.findIndex((s) => s.startsWith('PLATFORM RULES'));
    expect(previousIndex).toBeGreaterThanOrEqual(0);
    expect(overrideIndex).toBeGreaterThan(previousIndex);
    expect(platformIndex).toBeGreaterThan(overrideIndex);
    expect(user).toContain('Voice provider: ELEVENLABS');
    expect(user).toContain('Voice: rachel');
    expect(user).toContain('Voice speed: 1.1');
    expect(user).toContain('Caption instructions for this destination:\nAdd source links.');
  });

  it('keeps legacy channel-first ordering when no campaign is provided', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({
      channel: { name: 'Legacy' },
      series: { name: 'S' },
    });
    const sections = user.split('## ');
    expect(sections[1]).toMatch(/^CHANNEL CONTENT PROFILE/);
    expect(sections[2]).toMatch(/^CONTENT SERIES/);
  });

  it('omits campaign sections when absent', () => {
    const builder = new ContentPromptBuilder();
    const { user } = builder.build({});
    expect(user).not.toContain('CAMPAIGN PROFILE');
    expect(user).not.toContain('ASSIGNMENT OVERRIDES');
    expect(user).toContain('PLATFORM RULES');
  });
});

describe('buildTopicSuggestionPrompt campaign context', () => {
  it('prefers the campaign profile over the channel profile', () => {
    const { user } = buildTopicSuggestionPrompt({
      campaign: { name: 'AI News', audience: 'Engineers', language: 'ja-JP' },
      channel: { name: 'Legacy' },
      existingTopics: ['AI'],
      count: 5,
    });
    expect(user).toContain('## CAMPAIGN PROFILE');
    expect(user).toContain('Campaign: AI News');
    expect(user).toContain('Audience: Engineers');
    expect(user).toContain('## CHANNEL PROFILE');
    expect(user).toContain('## EXISTING TOPICS (avoid these)');
  });

  it('writes suggested topics in the requested language', () => {
    const { system } = buildTopicSuggestionPrompt({
      campaign: { name: 'C' },
      language: 'vi-VN',
    });
    expect(system).toContain('vi-VN');
  });
});
