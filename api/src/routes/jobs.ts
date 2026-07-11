import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

const prisma = new PrismaClient();

// Setup BullMQ Queue
const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const videoQueue = new Queue('video-processing', {
  connection: redisConnection as any,
});

interface CreateJobBody {
  youtube_url: string;
  callback_url?: string;
  transcription_provider?: string;
}

interface JobParams {
  id: string;
}

export async function jobsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // POST /jobs
  fastify.post<{ Body: CreateJobBody }>('/jobs', async (request, reply) => {
    const { youtube_url, callback_url, transcription_provider } = request.body;

    if (!youtube_url) {
      return reply.status(400).send({ error: 'youtube_url is required' });
    }

    try {
      const provider = transcription_provider || config.DEFAULT_TRANSCRIPTION_PROVIDER || 'deepgram';

      // 1. Simpan ke database dengan status pending
      const job = await prisma.job.create({
        data: {
          youtubeUrl: youtube_url,
          callbackUrl: callback_url || null,
          transcriptionProvider: provider,
          status: 'pending',
        },
      });

      // 2. Tambah job ke BullMQ queue
      // Kita gunakan job.id sebagai job name atau custom ID agar gampang dilacak
      await videoQueue.add(
        'process-video',
        {
          jobId: job.id,
          youtubeUrl: youtube_url,
          callbackUrl: callback_url,
          transcriptionProvider: provider,
        },
        {
          jobId: job.id, // BullMQ job ID unik sesuai database
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      return { job_id: job.id };
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to create job', details: error.message });
    }
  });

  // GET /jobs
  // Endpoint tambahan untuk dashboard memantau semua job
  fastify.get('/jobs', async (request, reply) => {
    try {
      const jobs = await prisma.job.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          clips: true,
        },
      });
      return jobs.map((job) => ({
        id: job.id,
        youtube_url: job.youtubeUrl,
        callback_url: job.callbackUrl,
        transcription_provider: job.transcriptionProvider,
        status: job.status,
        error: job.error,
        created_at: job.createdAt,
        updated_at: job.updatedAt,
        clips: job.clips.map((clip) => ({
          id: clip.id,
          start_time: clip.startTime,
          end_time: clip.endTime,
          title: clip.title,
          reason: clip.reason,
          file_path: clip.filePath,
          status: clip.status,
          error: clip.error,
        })),
      }));
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch jobs' });
    }
  });

  // GET /jobs/:id
  fastify.get<{ Params: JobParams }>('/jobs/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          clips: true,
        },
      });

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      return {
        id: job.id,
        youtube_url: job.youtubeUrl,
        callback_url: job.callbackUrl,
        transcription_provider: job.transcriptionProvider,
        status: job.status,
        error: job.error,
        created_at: job.createdAt,
        updated_at: job.updatedAt,
        clips: job.clips.map((clip) => ({
          id: clip.id,
          start_time: clip.startTime,
          end_time: clip.endTime,
          title: clip.title,
          reason: clip.reason,
          file_path: clip.filePath,
          status: clip.status,
          error: clip.error,
        })),
      };
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch job' });
    }
  });

  // GET /jobs/:id/clips
  fastify.get<{ Params: JobParams }>('/jobs/:id/clips', async (request, reply) => {
    const { id } = request.params;

    try {
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          clips: true,
        },
      });

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      return job.clips.map((clip) => ({
        id: clip.id,
        job_id: clip.jobId,
        start_time: clip.startTime,
        end_time: clip.endTime,
        title: clip.title,
        reason: clip.reason,
        file_path: clip.filePath,
        url: clip.filePath ? `/storage/${job.id}/${path.basename(clip.filePath)}` : null,
        status: clip.status,
        error: clip.error,
      }));
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch clips' });
    }
  });
}

import path from 'path';
