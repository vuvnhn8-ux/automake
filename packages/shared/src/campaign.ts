import { z } from 'zod';

// ---------------------------------------------------------------------------
// Content campaigns — config contracts and pure helpers.
//
// Priority (assignment override wins):
//   Assignment Override -> Campaign Config -> Project Default -> System Default
// ---------------------------------------------------------------------------

export const CampaignStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const PublishingAccountStatusSchema = z.enum([
  'CONNECTED',
  'EXPIRED',
  'REVOKED',
  'DISCONNECTED',
]);
export type PublishingAccountStatus = z.infer<typeof PublishingAccountStatusSchema>;

// ---------------------------------------------------------------------------
// Campaign profile configs (stored as JSON on ContentCampaign)
// ---------------------------------------------------------------------------

export const CampaignContentProfileSchema = z.object({
  description: z.string().max(5000).optional(),
  audience: z.string().max(2000).optional(),
  language: z.string().min(2).max(16).optional(),
  tone: z.string().max(100).optional(),
  contentStyle: z.string().max(2000).optional(),
  keywords: z.array(z.string().max(200)).max(200).optional(),
  excludedTopics: z.array(z.string().max(200)).max(200).optional(),
  cta: z.string().max(500).optional(),
});
export type CampaignContentProfile = z.infer<typeof CampaignContentProfileSchema>;

export const VisualProfileConfigSchema = z.object({
  source: z.enum(['AI_IMAGE', 'STOCK', 'MIXED']).default('AI_IMAGE'),
  style: z.string().max(200).optional(),
  preset: z.string().max(200).optional(),
  aspectRatio: z.string().max(20).optional(),
  resolution: z.string().max(20).optional(),
  imagePrompt: z.string().max(4000).optional(),
  negativePrompt: z.string().max(4000).optional(),
  characterConsistency: z.boolean().default(false),
});
export type VisualProfileConfig = z.infer<typeof VisualProfileConfigSchema>;

export const VoiceProfileConfigSchema = z.object({
  language: z.string().min(2).max(16).optional(),
  voiceProvider: z.string().max(200).optional(),
  voiceId: z.string().max(200).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'NEUTRAL']).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  pitch: z.number().min(-1).max(1).optional(),
  emotion: z.string().max(100).optional(),
  style: z.string().max(200).optional(),
});
export type VoiceProfileConfig = z.infer<typeof VoiceProfileConfigSchema>;

export const VideoProfileConfigSchema = z.object({
  durationMin: z.number().int().min(5).max(600).optional(),
  durationMax: z.number().int().min(5).max(600).optional(),
  aspectRatio: z.string().max(20).optional(),
  width: z.number().int().min(320).max(7680).optional(),
  height: z.number().int().min(320).max(7680).optional(),
  fps: z.number().int().min(15).max(120).optional(),
  templateId: z.string().max(100).optional(),
  subtitleEnabled: z.boolean().default(true),
  subtitleLanguage: z.string().min(2).max(16).optional(),
  subtitleStyle: z.record(z.unknown()).optional(),
});
export type VideoProfileConfig = z.infer<typeof VideoProfileConfigSchema>;

export const ProviderOverridesSchema = z.object({
  ai: z.string().max(100).optional(),
  image: z.string().max(100).optional(),
  video: z.string().max(100).optional(),
  voice: z.string().max(100).optional(),
});
export type ProviderOverrides = z.infer<typeof ProviderOverridesSchema>;

export const CampaignAutomationSchema = z.object({
  autoTopicGeneration: z.boolean().default(false),
  autoContentGeneration: z.boolean().default(true),
  autoRender: z.boolean().default(true),
  autoQA: z.boolean().default(true),
  autoPublish: z.boolean().default(false),
});
export type CampaignAutomation = z.infer<typeof CampaignAutomationSchema>;

// ---------------------------------------------------------------------------
// Effective config resolution helpers (pure, unit-testable)
// ---------------------------------------------------------------------------

export interface CampaignLike {
  contentProfile?: CampaignContentProfile | null;
  aiInstructions?: string | null;
  visualProfile?: VisualProfileConfig | null;
  voiceProfile?: VoiceProfileConfig | null;
  videoProfile?: VideoProfileConfig | null;
}

/** A structural subset of CampaignChannelAssignment (no prisma import needed). */
export interface AssignmentLike {
  languageOverride?: string | null;
  voiceProfileOverride?: Record<string, unknown> | null;
  visualProfileOverride?: Record<string, unknown> | null;
  videoProfileOverride?: Record<string, unknown> | null;
  captionInstructions?: string | null;
}

export interface AssignmentEffectiveConfig {
  language?: string;
  voice?: VoiceProfileConfig | null;
  visual?: VisualProfileConfig | null;
  video?: VideoProfileConfig | null;
  captionInstructions?: string | null;
}

/** The campaign's base content language, falling back to the project default. */
export function campaignBaseLanguage(
  campaign: CampaignLike | null,
  projectLanguage?: string | null,
): string | undefined {
  return campaign?.contentProfile?.language ?? projectLanguage ?? undefined;
}

/**
 * Normalizes a Prisma ContentCampaign row (whose JSON config columns are typed
 * as Prisma.JsonValue) into a structurally typed CampaignLike for the pure
 * helpers. Unknown JSON values are dropped rather than forced.
 */
export function normalizeCampaign(row: {
  contentProfile?: unknown;
  aiInstructions?: string | null;
  visualProfile?: unknown;
  voiceProfile?: unknown;
  videoProfile?: unknown;
} | null): CampaignLike | null {
  if (!row) return null;
  const profile = row.contentProfile;
  return {
    contentProfile: profile && typeof profile === 'object' && !Array.isArray(profile)
      ? (profile as CampaignContentProfile)
      : null,
    aiInstructions: row.aiInstructions ?? null,
    visualProfile: row.visualProfile && typeof row.visualProfile === 'object' && !Array.isArray(row.visualProfile)
      ? (row.visualProfile as VisualProfileConfig)
      : null,
    voiceProfile: row.voiceProfile && typeof row.voiceProfile === 'object' && !Array.isArray(row.voiceProfile)
      ? (row.voiceProfile as VoiceProfileConfig)
      : null,
    videoProfile: row.videoProfile && typeof row.videoProfile === 'object' && !Array.isArray(row.videoProfile)
      ? (row.videoProfile as VideoProfileConfig)
      : null,
  };
}

function mergeOverride<T extends object>(
  base: T | null | undefined,
  override: Record<string, unknown> | null | undefined,
): T | null {
  if (!base && !override) return null;
  return { ...(base ?? {}), ...(override ?? {}) } as T;
}

/**
 * Resolves the effective config for one assignment by layering the assignment
 * override on top of the campaign config (override wins per field).
 */
export function resolveEffectiveConfig(
  campaign: CampaignLike | null,
  assignment: AssignmentLike | null | undefined,
  projectLanguage?: string | null,
): AssignmentEffectiveConfig {
  const baseLanguage = campaignBaseLanguage(campaign, projectLanguage);
  return {
    language: assignment?.languageOverride ?? baseLanguage,
    voice: mergeOverride<VoiceProfileConfig>(campaign?.voiceProfile ?? null, assignment?.voiceProfileOverride),
    visual: mergeOverride<VisualProfileConfig>(campaign?.visualProfile ?? null, assignment?.visualProfileOverride),
    video: mergeOverride<VideoProfileConfig>(campaign?.videoProfile ?? null, assignment?.videoProfileOverride),
    captionInstructions: assignment?.captionInstructions ?? null,
  };
}

/** Distinct languages required across enabled assignments (localization planning). */
export function planVariantLanguages(
  campaign: CampaignLike | null,
  assignments: AssignmentLike[],
  projectLanguage?: string | null,
): string[] {
  const langs = assignments
    .map((a) => resolveEffectiveConfig(campaign, a, projectLanguage).language)
    .filter((l): l is string => Boolean(l));
  return Array.from(new Set(langs));
}

/** Assignments whose effective language matches the given content language. */
export function assignmentsForLanguage(
  campaign: CampaignLike | null,
  assignments: AssignmentLike[],
  contentLanguage: string | null | undefined,
  projectLanguage?: string | null,
): AssignmentLike[] {
  return assignments.filter(
    (a) => (resolveEffectiveConfig(campaign, a, projectLanguage).language ?? undefined) === (contentLanguage ?? undefined),
  );
}
