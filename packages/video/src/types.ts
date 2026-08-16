import type { VideoTemplate } from '@avf/shared';

export type SubtitlePosition = 'bottom' | 'top' | 'middle';
export type SubtitleAnimation = 'none' | 'fade' | 'pop';

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  position: SubtitlePosition;
  animation: SubtitleAnimation;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'DejaVu Sans',
  fontSize: 46,
  color: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 3,
  backgroundColor: '#000000',
  backgroundOpacity: 0.35,
  position: 'bottom',
  animation: 'fade',
};

export interface TemplateDefinition {
  name: VideoTemplate;
  label: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  width: number;
  height: number;
  fps: number;
  subtitleStyle: SubtitleStyle;
  transition: 'none' | 'fade' | 'cut';
  musicTrack: string;
  introDuration: number;
  outroDuration: number;
  defaultDuration: number;
  description: string;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SceneRenderInput {
  order: number;
  durationSeconds: number;
  /** Absolute local path to the background image (if any). */
  imagePath?: string;
  /** Absolute local path to the motion video (if any). */
  videoPath?: string;
  /** Absolute local path to the narration audio (if any). */
  audioPath?: string;
  subtitleText?: string;
}

export interface RenderRequest {
  width: number;
  height: number;
  fps: number;
  scenes: SceneRenderInput[];
  subtitleStyle: SubtitleStyle;
  /** Absolute local path to background music (optional). */
  musicPath?: string;
  /** Where the final video should be written (absolute path). */
  outputPath: string;
  /** Directory for intermediate files (filter scripts, ASS). */
  workDir: string;
}

export interface RenderResult {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  log: string;
  subtitlePath?: string;
}

export interface VideoRenderer {
  readonly name: string;
  render(req: RenderRequest): Promise<RenderResult>;
}
