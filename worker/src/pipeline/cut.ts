import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

export function cutAndBurnCaption(
  sourceVideoPath: string,
  startTime: number,
  endTime: number,
  subtitleAssPath: string,
  outputClipPath: string,
  onProgress: (status: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;
    if (duration <= 0) {
      return reject(new Error(`Invalid duration: ${duration}s (start: ${startTime}, end: ${endTime})`));
    }

    onProgress(`Cutting & burning captions for clip: ${path.basename(outputClipPath)} (${duration.toFixed(2)}s)...`);

    // Dapatkan folder tujuan dan jadikan subtitle path relatif terhadap folder tersebut
    const destDir = path.dirname(outputClipPath);
    const relativeSubPath = path.relative(destDir, subtitleAssPath);

    // Kita gunakan spawn agar lebih aman dari injection dan gampang monitor stderr
    // PENTING: Cwd dipasang ke destDir agar filter subtitles mendeteksi file ass relatif
    const args = [
      '-y',
      '-ss',
      startTime.toFixed(3),
      '-t',
      duration.toFixed(3),
      '-i',
      sourceVideoPath,
      '-vf',
      `scale=-2:'min(${config.MAX_OUTPUT_RESOLUTION},ih)',subtitles=${relativeSubPath}`,
      '-c:v',
      'libx264',
      '-preset',
      config.FFMPEG_PRESET,
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputClipPath,
    ];

    const ffmpeg = spawn('ffmpeg', args, { cwd: destDir });

    let stderrData = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`ffmpeg failed to cut and burn caption (exit code ${code}). Stderr: ${stderrData}`)
        );
      }
      resolve();
    });
  });
}
