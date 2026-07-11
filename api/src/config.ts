import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:../storage/db.sqlite',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  STORAGE_PATH: path.resolve(process.env.STORAGE_PATH || '../storage'),
  DEFAULT_TRANSCRIPTION_PROVIDER: process.env.DEFAULT_TRANSCRIPTION_PROVIDER || 'deepgram',
};
