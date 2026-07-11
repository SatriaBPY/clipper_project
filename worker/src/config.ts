import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.6',
  DATABASE_URL: process.env.DATABASE_URL || 'file:../storage/db.sqlite',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  STORAGE_PATH: path.resolve(process.env.STORAGE_PATH || '../storage'),
  FFMPEG_PRESET: process.env.FFMPEG_PRESET || 'veryfast',
  MAX_OUTPUT_RESOLUTION: parseInt(process.env.MAX_OUTPUT_RESOLUTION || '720', 10),
  DEFAULT_TRANSCRIPTION_PROVIDER: process.env.DEFAULT_TRANSCRIPTION_PROVIDER || 'deepgram',
};
