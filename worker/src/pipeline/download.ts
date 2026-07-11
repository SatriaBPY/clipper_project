import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

interface DownloadResult {
  videoPath: string;
  audioPath: string;
}

export function downloadVideo(
  youtubeUrl: string,
  jobDir: string,
  onProgress: (status: string) => void
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    // Pastikan jobDir ada
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    const videoPath = path.join(jobDir, 'source.mp4');
    const audioPath = path.join(jobDir, 'source.mp3');

    onProgress('Downloading video via yt-dlp...');

    // Jalankan yt-dlp
    // -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best"
    const ytDlp = spawn('yt-dlp', [
      '--js-runtimes',
      'node',
      '-f',
      'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best',
      '--merge-output-format',
      'mp4',
      '-o',
      videoPath,
      youtubeUrl,
    ]);

    let stderrData = '';

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      // Log progress sederhana jika perlu
      if (output.includes('%')) {
        // Cocokkan pola progress jika ingin parse detail
      }
    });

    ytDlp.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    ytDlp.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed with exit code ${code}. Error: ${stderrData}`));
      }

      onProgress('Extracting audio to 16kHz mono MP3...');

      // Jalankan ffmpeg untuk extract audio mono MP3 32k
      const ffmpeg = spawn('ffmpeg', [
        '-y', // Overwrite if exists
        '-i',
        videoPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-b:a',
        '32k',
        '-ac',
        '1',
        '-ar',
        '16000',
        audioPath,
      ]);

      let ffmpegStderr = '';

      ffmpeg.stderr.on('data', (data) => {
        ffmpegStderr += data.toString();
      });

      ffmpeg.on('close', (ffmpegCode) => {
        if (ffmpegCode !== 0) {
          return reject(new Error(`ffmpeg audio extraction failed with exit code ${ffmpegCode}. Error: ${ffmpegStderr}`));
        }

        resolve({
          videoPath,
          audioPath,
        });
      });
    });
  });
}
