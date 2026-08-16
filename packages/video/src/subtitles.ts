import type { SubtitleCue, SubtitleStyle } from './types.js';

/**
 * SRT generation from timed cues.
 */
export function buildSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue) => {
      return `${cue.index}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`;
    })
    .join('\n');
}

function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * ASS generation from timed cues with the given style.
 * libass (used by ffmpeg's subtitles filter) renders these directly.
 */
export function buildAss(cues: SubtitleCue[], style: SubtitleStyle): string {
  const primary = hexToAss(style.color);
  const outline = hexToAss(style.outlineColor);
  const back = hexToAss(style.backgroundColor);
  const align = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const marginV = style.position === 'top' ? 90 : 110;
  const alpha = Math.round(style.backgroundOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},&H${primary},&H${primary},&H${outline},&H${alpha}${back},-1,0,0,0,100,100,0,0,1,${style.outlineWidth},0,${align},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((cue) => {
      const anim = buildAssAnimation(style.animation, cue);
      return `Dialogue: 0,${formatAssTime(cue.startMs)},${formatAssTime(cue.endMs)},Default,,0,0,0,,${anim}${escapeAss(cue.text)}`;
    })
    .join('\n');

  return header + events + '\n';
}

function buildAssAnimation(animation: string, cue: SubtitleCue): string {
  const duration = cue.endMs - cue.startMs;
  if (animation === 'fade') {
    return `{\\fad(150,150)}`;
  }
  if (animation === 'pop') {
    return `{\\t(0,${Math.min(duration, 300)},\\fscx120\\fscy120)}`;
  }
  return '';
}

function formatAssTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((totalSeconds % 1) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

function hexToAss(hex: string): string {
  // ASS uses &HBBGGRR
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `${b}${g}${r}`.toUpperCase();
}

function escapeAss(text: string): string {
  return text.replace(/\{/g, '\\(').replace(/\}/g, '\\)').replace(/\n/g, '\\N');
}

/**
 * Builds timed cues from scene definitions. Start times come from the caller
 * (cumulative scene durations); end times = start + duration.
 */
export function buildCues(
  scenes: { durationSeconds: number; subtitleText?: string }[],
  startTimesMs: number[],
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  scenes.forEach((scene, i) => {
    const text = scene.subtitleText?.trim();
    if (!text) return;
    const startMs = startTimesMs[i] ?? 0;
    const endMs = startMs + scene.durationSeconds * 1000;
    cues.push({ index: cues.length + 1, startMs, endMs, text });
  });
  return cues;
}
