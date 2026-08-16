import { spawn } from 'node:child_process';

export interface FFmpegProbe {
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * Runs `ffmpeg -version` and reports availability. Never throws — callers
 * decide how to react. Used at worker boot so a missing FFmpeg binary fails
 * fast with a clear message instead of failing every render job silently.
 */
export function checkFFmpeg(ffmpegPath = 'ffmpeg', timeoutMs = 10_000): Promise<FFmpegProbe> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(ffmpegPath, ['-version'], { windowsHide: true });
    } catch (err) {
      resolve({ available: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let out = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        proc.kill('SIGKILL');
      } catch {
        // already exited
      }
      resolve({ available: false, error: `ffmpeg -version timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    const finish = (probe: FFmpegProbe): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(probe);
    };

    proc.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on('error', (err) => {
      finish({ available: false, error: err.message });
    });
    proc.on('close', (code) => {
      if (code === 0) {
        const firstLine = (out.split('\n')[0] ?? '').trim();
        finish({ available: true, version: firstLine || undefined });
      } else {
        finish({ available: false, error: `ffmpeg -version exited with code ${code}` });
      }
    });
  });
}

/**
 * Startup gate for RENDER_DRIVER=ffmpeg. Throws a clear error when FFmpeg is
 * required but unavailable — never silently falls back to another renderer.
 * The mock renderer (RENDER_DRIVER=mock) remains available for development.
 */
export async function assertFFmpegAvailable(ffmpegPath = 'ffmpeg'): Promise<boolean> {
  const probe = await checkFFmpeg(ffmpegPath);
  if (!probe.available) {
    throw new Error(
      `FFmpeg is required (RENDER_DRIVER=ffmpeg) but unavailable at "${ffmpegPath}"` +
        `${probe.error ? `: ${probe.error}` : ''}. ` +
        `Install FFmpeg (see DEPLOYMENT.md) or set RENDER_DRIVER=mock for development.`,
    );
  }
  console.log(`[worker] ffmpeg available · ${probe.version ?? ffmpegPath}`);
  return true;
}
