import type { TemplateDefinition } from './types.js';
import { DEFAULT_SUBTITLE_STYLE } from './types.js';

/**
 * Built-in template catalog. Each template defines resolution, subtitle style,
 * transitions and default duration. Users can also override style per render.
 */
export const TEMPLATES: TemplateDefinition[] = [
  {
    name: 'DEFAULT_REELS',
    label: 'Default Reels',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    transition: 'fade',
    musicTrack: '',
    introDuration: 0,
    outroDuration: 1,
    defaultDuration: 60,
    description: 'Standard vertical short-video layout for Facebook Reels.',
  },
  {
    name: 'NEWS',
    label: 'News',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontFamily: 'DejaVu Sans',
      position: 'bottom',
      animation: 'fade',
    },
    transition: 'cut',
    musicTrack: '',
    introDuration: 1,
    outroDuration: 1,
    defaultDuration: 50,
    description: 'Fast-paced news style with cut transitions and bold captions.',
  },
  {
    name: 'FACTS',
    label: 'Facts',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 52,
      position: 'middle',
      animation: 'pop',
    },
    transition: 'fade',
    musicTrack: '',
    introDuration: 0,
    outroDuration: 1,
    defaultDuration: 55,
    description: 'Hook-driven facts format with centered pop captions.',
  },
  {
    name: 'TOP5',
    label: 'Top 5',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 50,
      position: 'bottom',
      animation: 'fade',
    },
    transition: 'cut',
    musicTrack: '',
    introDuration: 1,
    outroDuration: 2,
    defaultDuration: 70,
    description: 'Listicle countdown format: "Top 5 ...".',
  },
  {
    name: 'STORY',
    label: 'Story',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      position: 'bottom',
      animation: 'fade',
    },
    transition: 'fade',
    musicTrack: '',
    introDuration: 1,
    outroDuration: 2,
    defaultDuration: 75,
    description: 'Narrative storytelling with gentle fades.',
  },
  {
    name: 'EDUCATIONAL',
    label: 'Educational',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 40,
      position: 'bottom',
      animation: 'none',
    },
    transition: 'fade',
    musicTrack: '',
    introDuration: 1,
    outroDuration: 1,
    defaultDuration: 90,
    description: 'Widescreen explainer format.',
  },
];

export function getTemplate(name: string): TemplateDefinition {
  const template = TEMPLATES.find((t) => t.name === name);
  if (!template) {
    return TEMPLATES[0]!;
  }
  return template;
}
