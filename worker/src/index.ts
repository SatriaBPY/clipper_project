import { Worker, Job as BullMQJob } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { downloadVideo } from './pipeline/download';
import { transcribeAudio } from './pipeline/transcribe';
import { analyzeTranscript } from './pipeline/analyze';
import { generateAssFile } from './pipeline/caption';
import { cutAndBurnCaption } from './pipeline/cut';
import { sendCallback } from './pipeline/callback';

const prisma = new PrismaClient();

// Setup Redis connection
const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

interface JobData {
  jobId: string;
  youtubeUrl: string;
  callbackUrl?: string;
  transcriptionProvider?: string;
}

// Inisialisasi Worker dengan concurrency = 1 (Hardware Constraint)
const worker = new Worker<JobData>(
  'video-processing',
  async (bullmqJob: BullMQJob<JobData>) => {
    const { jobId, youtubeUrl, callbackUrl, transcriptionProvider } = bullmqJob.data;
    const jobDir = path.join(config.STORAGE_PATH, jobId);
    
    // Pastikan folder storage/{jobId} ada
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    let sourceVideoPath = '';
    let sourceAudioPath = '';

    console.log(`[Worker] Starting job ${jobId} with URL ${youtubeUrl}`);

    try {
      // 1. UPDATE: downloading
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'downloading' },
      });

      const downloadResult = await downloadVideo(youtubeUrl, jobDir, (statusMsg) => {
        console.log(`[Job ${jobId}] ${statusMsg}`);
      });
      sourceVideoPath = downloadResult.videoPath;
      sourceAudioPath = downloadResult.audioPath;

      // 2. UPDATE: transcribing
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'transcribing' },
      });

      const provider = transcriptionProvider || config.DEFAULT_TRANSCRIPTION_PROVIDER || 'deepgram';
      const transcription = await transcribeAudio(sourceAudioPath, provider, (statusMsg) => {
        console.log(`[Job ${jobId}] ${statusMsg}`);
      });

      // Simpan transkrip ke DB
      await prisma.transcript.create({
        data: {
          jobId: jobId,
          fullText: transcription.fullText,
          wordTimestamps: JSON.stringify(transcription.wordTimestamps),
        },
      });

      // Simpan transkrip versi JSON ke folder lokal untuk audit user
      fs.writeFileSync(
        path.join(jobDir, 'transcript.json'),
        JSON.stringify(transcription, null, 2),
        'utf-8'
      );

      // 3. UPDATE: analyzing
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'analyzing' },
      });

      const segments = await analyzeTranscript(transcription.wordTimestamps, (statusMsg) => {
        console.log(`[Job ${jobId}] ${statusMsg}`);
      });

      // Buat records Clip di database
      const createdClips = [];
      for (const segment of segments) {
        const clip = await prisma.clip.create({
          data: {
            jobId: jobId,
            startTime: segment.start_time,
            endTime: segment.end_time,
            title: segment.title,
            reason: segment.reason,
            status: 'pending',
          },
        });
        createdClips.push(clip);
      }

      // 4. UPDATE: cutting & captioning
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'cutting' }, // Menyatakan tahap editing
      });

      const finalClipsInfo = [];

      for (let i = 0; i < createdClips.length; i++) {
        const clipRecord = createdClips[i];
        console.log(`[Job ${jobId}] Processing clip ${i + 1}/${createdClips.length}: ${clipRecord.title}`);

        await prisma.clip.update({
          where: { id: clipRecord.id },
          data: { status: 'processing' },
        });

        const clipVideoPath = path.join(jobDir, `clip_${clipRecord.id}.mp4`);
        const subtitleAssPath = path.join(jobDir, `clip_${clipRecord.id}.ass`);

        try {
          // A. Generate ASS Subtitle File khusus segmen ini
          generateAssFile(
            transcription.wordTimestamps,
            clipRecord.startTime,
            clipRecord.endTime,
            subtitleAssPath
          );

          // B. Potong dan bakar subtitle (Single Pass)
          await cutAndBurnCaption(
            sourceVideoPath,
            clipRecord.startTime,
            clipRecord.endTime,
            subtitleAssPath,
            clipVideoPath,
            (statusMsg) => {
              console.log(`[Job ${jobId} - Clip ${i + 1}] ${statusMsg}`);
            }
          );

          // C. Update database clip selesai
          const updatedClip = await prisma.clip.update({
            where: { id: clipRecord.id },
            data: {
              status: 'done',
              filePath: clipVideoPath,
            },
          });

          finalClipsInfo.push({
            id: updatedClip.id,
            start_time: updatedClip.startTime,
            end_time: updatedClip.endTime,
            title: updatedClip.title,
            reason: updatedClip.reason,
            file_path: updatedClip.filePath,
            status: updatedClip.status,
          });
        } catch (clipErr: any) {
          console.error(`[Job ${jobId}] Error processing clip ${clipRecord.title}:`, clipErr);
          
          const updatedClip = await prisma.clip.update({
            where: { id: clipRecord.id },
            data: {
              status: 'failed',
              error: clipErr.message,
            },
          });

          finalClipsInfo.push({
            id: updatedClip.id,
            start_time: updatedClip.startTime,
            end_time: updatedClip.endTime,
            title: updatedClip.title,
            reason: updatedClip.reason,
            file_path: null,
            status: updatedClip.status,
          });
        }
      }

      // 5. CLEANUP: Hapus raw source video & audio untuk menghemat disk (SSD 128GB)
      console.log(`[Job ${jobId}] Cleaning up raw download files to save disk space...`);
      if (fs.existsSync(sourceVideoPath)) {
        fs.unlinkSync(sourceVideoPath);
      }
      if (fs.existsSync(sourceAudioPath)) {
        fs.unlinkSync(sourceAudioPath);
      }

      // 6. UPDATE: done
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'done' },
      });

      console.log(`[Job ${jobId}] Finished successfully.`);

      // 7. WEBHOOK: Panggil callback_url jika ada
      if (callbackUrl) {
        await sendCallback(callbackUrl, {
          job_id: jobId,
          status: 'done',
          clips: finalClipsInfo,
        });
      }

    } catch (error: any) {
      console.error(`[Job ${jobId}] Job pipeline failed:`, error);

      // Coba hapus source file jika sempat dibuat
      try {
        if (sourceVideoPath && fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath);
        if (sourceAudioPath && fs.existsSync(sourceAudioPath)) fs.unlinkSync(sourceAudioPath);
      } catch (cleanupErr) {
        console.error(`[Job ${jobId}] Additional cleanup error:`, cleanupErr);
      }

      // Update status job ke failed
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: error.message,
        },
      });

      // Update remaining pending clips ke failed
      try {
        await prisma.clip.updateMany({
          where: { jobId: jobId, status: 'pending' },
          data: { status: 'failed', error: 'Parent job failed' },
        });
      } catch (updateClipsErr) {
        console.error(`[Job ${jobId}] Failed to update clip statuses:`, updateClipsErr);
      }

      // Panggil callback failed jika ada
      if (callbackUrl) {
        try {
          const clips = await prisma.clip.findMany({ where: { jobId } });
          await sendCallback(callbackUrl, {
            job_id: jobId,
            status: 'failed',
            clips: clips.map((c) => ({
              id: c.id,
              start_time: c.startTime,
              end_time: c.endTime,
              title: c.title,
              reason: c.reason,
              file_path: c.filePath,
              status: c.status,
            })),
          });
        } catch (cbErr) {
          console.error(`[Job ${jobId}] Webhook callback notification failed:`, cbErr);
        }
      }
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 1, // Memproses antrean satu per satu
  }
);

worker.on('ready', () => {
  console.log('--- ClipForge Worker is active and waiting for jobs ---');
});

worker.on('failed', (job, err) => {
  console.error(`[BullMQ Worker Global Failed] Job ${job?.id} failed with error:`, err);
});
