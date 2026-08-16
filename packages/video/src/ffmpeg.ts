import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { env } from '@avf/config';
import { buildAss } from './subtitles.js';
import { renderRequestScenesForClip, renderRequestTotalDuration } from './plan.js';
import type { RenderRequest, RenderResult, VideoRenderer } from './types.js';
import { fileSize } from './index.js';

export interface FFmpegResult {
  code: number;
  stderr: string;
}

export function runFFmpeg(
  args: string[],
  timeoutMs = env.RENDER_TIMEOUT_MS,
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/**
 * Real FFmpeg renderer.
 *
 * Pipeline per render:
 *   1. Write an ASS subtitle file (if any scene has subtitle text).
 *   2. Build a filter_complex script that:
 *        - normalizes every scene visual (scale/crop to target, uniform fps)
 *        - concatenates the scenes into one video track
 *        - positions each narration track with adelay + normalizes to stereo
 *        - mixes narration with optional background music (music volume 0.15)
 *        - burns the ASS subtitles
 *   3. Encode H.264 + AAC, yuv420p, +faststart.
 */
export class FFmpegVideoRenderer implements VideoRenderer {
  readonly name = 'ffmpeg';

  async render(req: RenderRequest): Promise<RenderResult> {
    await mkdir(req.workDir, { recursive: true });

    const { clips, totalMs, totalSeconds } = renderRequestScenesForClip(req);
    const totalDuration = renderRequestTotalDuration(req);
    if (clips.length === 0) {
      throw new Error('Render request has no scenes');
    }

    const { width, height, fps } = req;

    // 1. Inputs
    const inputArgs: string[] = [];
    const inputPaths: string[] = [];
    for (const clip of clips) {
      const { scene } = clip;
      if (scene.videoPath) {
        inputArgs.push('-t', String(scene.durationSeconds));
        inputArgs.push('-i', scene.videoPath);
        inputPaths.push(scene.videoPath);
      } else if (scene.imagePath) {
        inputArgs.push('-loop', '1', '-framerate', String(fps));
        inputArgs.push('-t', String(scene.durationSeconds));
        inputArgs.push('-i', scene.imagePath);
        inputPaths.push(scene.imagePath);
      } else {
        throw new Error(`Scene ${scene.order} has no image or video asset`);
      }
    }

    const audioInputIndexes: number[] = [];
    for (const clip of clips) {
      if (clip.scene.audioPath) {
        inputArgs.push('-i', clip.scene.audioPath);
        inputPaths.push(clip.scene.audioPath);
        audioInputIndexes.push(inputPaths.length - 1);
      }
    }

    const hasMusic = Boolean(req.musicPath) && clips.length > 0;
    let musicInputIndex = -1;
    if (hasMusic) {
      inputArgs.push('-stream_loop', '-1');
      inputArgs.push('-i', req.musicPath!);
      inputPaths.push(req.musicPath!);
      musicInputIndex = inputPaths.length - 1;
    }

    // 2. Video filter chain
    const lines: string[] = [];
    const videoLabels: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const label = `v${i}`;
      videoLabels.push(`[${label}]`);
      lines.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1,setsar=1[${label}];`,
      );
    }
    const concatLabel = 'base';
    lines.push(
      `${videoLabels.join('')}concat=n=${clips.length}:v=1:a=0[${concatLabel}];`,
    );

    // 3. Audio filter chain
    const audioInputs: string[] = [];
    const audioIndexes: string[] = [];
    let audioIdx = 0;
    for (const clip of clips) {
      const audioPath = clip.scene.audioPath;
      if (!audioPath) continue;
      const label = `a${audioIdx}`;
      const actualIdx = audioInputIndexes[audioIdx]!;
      lines.push(
        `[${actualIdx}:a]aformat=channel_layouts=stereo:sample_rates=44100,adelay=${clip.startMs}|${clip.startMs},apad=whole_dur=${totalMs / 1000},atrim=0:${totalSeconds}[${label}];`,
      );
      audioInputs.push(`[${label}]`);
      audioIndexes.push(label);
      audioIdx++;
    }

    // Music: trim to total length and lower volume.
    let musicLabel = '';
    if (hasMusic) {
      musicLabel = 'mus';
      lines.push(
        `[${musicInputIndex}:a]aformat=channel_layouts=stereo:sample_rates=44100,atrim=0:${totalSeconds},asetpts=PTS-STARTPTS,volume=0.15[${musicLabel}];`,
      );
    }

    // Mix voice tracks (with music) into a single audio track.
    let voiceLabel: string;
    if (audioInputs.length === 0) {
      voiceLabel = 'silence';
      lines.push(`anullsrc=r=44100:cl=stereo:d=${totalSeconds}[${voiceLabel}];`);
    } else if (audioInputs.length === 1) {
      voiceLabel = audioIndexes[0]!;
    } else {
      voiceLabel = 'voice';
      lines.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:normalize=0[${voiceLabel}];`);
    }

    let audioLabel: string;
    if (hasMusic) {
      audioLabel = 'aud';
      lines.push(`[${voiceLabel}][${musicLabel}]amix=inputs=2:normalize=0[${audioLabel}];`);
    } else {
      audioLabel = voiceLabel;
    }

    // 4. Subtitles (burn-in via ASS)
    let subtitlePath: string | undefined;
    const anySubtitle = clips.some((c) => c.scene.subtitleText?.trim());
    let finalVideoLabel = concatLabel;
    if (anySubtitle) {
      const cues = clips
        .map((c, i) => ({ ...c, index: i + 1 }))
        .filter((c) => c.scene.subtitleText?.trim())
        .map((c, i) => ({
          index: i + 1,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.scene.subtitleText!.trim(),
        }));
      subtitlePath = join(req.workDir, `subtitle_${basename(req.outputPath)}.ass`);
      await writeFile(subtitlePath, buildAss(cues, req.subtitleStyle), 'utf8');
      const escaped = escapeFilterPath(subtitlePath);
      finalVideoLabel = 'vidass';
      lines.push(`[${concatLabel}]subtitles=${escaped}[${finalVideoLabel}];`);
    }

    // 5. Write filter script and run
    const filterScript = join(req.workDir, `filter_${basename(req.outputPath)}.txt`);
    await writeFile(filterScript, lines.join('\n'), 'utf8');

    const outputArgs = [
      '-filter_complex_script', filterScript,
      '-map', `[${finalVideoLabel}]`,
      '-map', `[${audioLabel}]`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ac', '2',
      '-movflags', '+faststart',
      '-t', String(totalSeconds),
      '-y',
      req.outputPath,
    ];

    const result = await runFFmpeg([...inputArgs, ...outputArgs]);
    if (result.code !== 0) {
      const shortLog = result.stderr.slice(-4000);
      throw new Error(`FFmpeg render failed (exit ${result.code}).\n${shortLog}`);
    }

    const sizeBytes = await fileSize(req.outputPath);
    await rm(filterScript, { force: true });

    return {
      outputPath: req.outputPath,
      durationSeconds: totalDuration,
      width,
      height,
      fps,
      sizeBytes,
      log: result.stderr.slice(-2000),
      subtitlePath,
    };
  }
}

/**
 * Escapes a path for use inside a ffmpeg filter (subtitles=...). Colon and
 * apostrophe are the main offenders; backslashes are converted to forward
 * slashes (accepted by ffmpeg on Windows too).
 */
export function escapeFilterPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.replace(/([':\\])/g, '\\$1');
}
