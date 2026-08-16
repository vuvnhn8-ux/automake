import { describe, it, expect } from 'vitest';
import {
  campaignBaseLanguage,
  normalizeCampaign,
  resolveEffectiveConfig,
  planVariantLanguages,
  assignmentsForLanguage,
  type CampaignLike,
} from '../src/campaign.js';

describe('campaignBaseLanguage', () => {
  it('uses the campaign content profile language', () => {
    const campaign: CampaignLike = { contentProfile: { language: 'ja-JP' } };
    expect(campaignBaseLanguage(campaign, 'vi-VN')).toBe('ja-JP');
  });

  it('falls back to the project language', () => {
    expect(campaignBaseLanguage(null, 'vi-VN')).toBe('vi-VN');
    expect(campaignBaseLanguage({ contentProfile: null }, 'vi-VN')).toBe('vi-VN');
  });

  it('returns undefined when nothing is set', () => {
    expect(campaignBaseLanguage(null, null)).toBeUndefined();
  });
});

describe('normalizeCampaign', () => {
  it('parses JSON config columns into typed profiles', () => {
    const row = {
      contentProfile: { language: 'ja-JP', tone: 'professional', keywords: ['ai'] },
      aiInstructions: 'Follow brand safety',
      voiceProfile: { voiceId: 'v1' },
      visualProfile: { style: 'cinematic' },
      videoProfile: { fps: 30 },
    };
    const normalized = normalizeCampaign(row);
    expect(normalized?.contentProfile?.language).toBe('ja-JP');
    expect(normalized?.contentProfile?.tone).toBe('professional');
    expect(normalized?.aiInstructions).toBe('Follow brand safety');
    expect(normalized?.voiceProfile?.voiceId).toBe('v1');
    expect(normalized?.visualProfile?.style).toBe('cinematic');
    expect(normalized?.videoProfile?.fps).toBe(30);
  });

  it('drops scalar/non-object JSON values safely', () => {
    const normalized = normalizeCampaign({
      contentProfile: 'not-an-object',
      visualProfile: 42,
      voiceProfile: null,
      videoProfile: undefined,
    });
    expect(normalized?.contentProfile).toBeNull();
    expect(normalized?.visualProfile).toBeNull();
    expect(normalized?.voiceProfile).toBeNull();
    expect(normalized?.videoProfile).toBeNull();
  });

  it('returns null for empty rows', () => {
    expect(normalizeCampaign(null)).toBeNull();
  });
});

describe('resolveEffectiveConfig', () => {
  const campaign: CampaignLike = {
    contentProfile: { language: 'ja-JP' },
    voiceProfile: { voiceProvider: 'ELEVENLABS', voiceId: 'base', speed: 1 },
    videoProfile: { fps: 30, subtitleEnabled: true },
    visualProfile: { source: 'AI_IMAGE', style: 'cinematic' },
  };

  it('layers assignment overrides on top of the campaign config', () => {
    const effective = resolveEffectiveConfig(campaign, {
      languageOverride: 'en-US',
      voiceProfileOverride: { voiceId: 'override' },
    });
    expect(effective.language).toBe('en-US');
    expect(effective.voice?.voiceProvider).toBe('ELEVENLABS');
    expect(effective.voice?.voiceId).toBe('override');
    expect(effective.voice?.speed).toBe(1);
  });

  it('keeps the campaign config when the assignment has no overrides', () => {
    const effective = resolveEffectiveConfig(campaign, {});
    expect(effective.language).toBe('ja-JP');
    expect(effective.voice?.voiceId).toBe('base');
    expect(effective.video?.fps).toBe(30);
  });

  it('honours caption instructions from the assignment', () => {
    const effective = resolveEffectiveConfig(campaign, {
      captionInstructions: 'Add source links in the description',
    });
    expect(effective.captionInstructions).toBe('Add source links in the description');
  });
});

describe('planVariantLanguages', () => {
  const campaign: CampaignLike = { contentProfile: { language: 'ja-JP' } };

  it('collects distinct effective languages across assignments', () => {
    const languages = planVariantLanguages(campaign, [
      {}, // defaults to campaign language ja-JP
      { languageOverride: 'ja-JP' },
      { languageOverride: 'en-US' },
      { languageOverride: 'en-US' },
      { languageOverride: 'vi-VN' },
    ]);
    expect(languages.sort()).toEqual(['en-US', 'ja-JP', 'vi-VN'].sort());
  });

  it('only includes the base language once', () => {
    const languages = planVariantLanguages(campaign, [
      { languageOverride: 'ja-JP' },
      { languageOverride: 'ja-JP' },
    ]);
    expect(languages).toEqual(['ja-JP']);
  });
});

describe('assignmentsForLanguage', () => {
  const campaign: CampaignLike = { contentProfile: { language: 'ja-JP' } };
  const assignments = [
    { languageOverride: 'ja-JP' },
    { languageOverride: 'en-US' },
    {},
    { languageOverride: 'vi-VN' },
  ];

  it('matches assignments whose effective language equals the content language', () => {
    const en = assignmentsForLanguage(campaign, assignments, 'en-US');
    expect(en).toHaveLength(1);

    const ja = assignmentsForLanguage(campaign, assignments, 'ja-JP');
    expect(ja).toHaveLength(2); // explicit + default

    const vi = assignmentsForLanguage(campaign, assignments, 'vi-VN');
    expect(vi).toHaveLength(1);
  });

  it('returns nothing for an unknown language', () => {
    const match = assignmentsForLanguage(campaign, assignments, 'fr-FR');
    expect(match).toHaveLength(0);
  });
});
