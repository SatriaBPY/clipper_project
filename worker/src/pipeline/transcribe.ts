import axios from 'axios';
import fs from 'fs';
import { config } from '../config';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

interface TranscribeResult {
  fullText: string;
  wordTimestamps: WordTimestamp[];
}

export async function transcribeAudio(
  audioPath: string,
  provider: string = 'deepgram',
  onProgress: (status: string) => void
): Promise<TranscribeResult> {
  if (provider === 'groq') {
    if (!config.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set in environment variables');
    }

    onProgress('Sending audio to Groq Whisper-large-v3...');

    try {
      const fileBuffer = fs.readFileSync(audioPath);
      // Use standard Node Blob from buffer or global Blob
      const fileBlob = new Blob([fileBuffer], { type: 'audio/wav' });

      const formData = new FormData();
      formData.append('file', fileBlob, 'audio.wav');
      formData.append('model', 'whisper-large-v3');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const response = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        formData,
        {
          headers: {
            Authorization: `Bearer ${config.GROQ_API_KEY}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const data = response.data;
      const fullText = data.text || '';
      const wordTimestamps: WordTimestamp[] = (data.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.probability !== undefined ? w.probability : 1.0,
        punctuated_word: w.word,
      }));

      return {
        fullText,
        wordTimestamps,
      };
    } catch (error: any) {
      const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      throw new Error(`Groq Whisper transcription failed: ${errorDetails}`);
    }
  }

  // Default to deepgram
  if (!config.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not set in environment variables');
  }

  onProgress('Sending audio to Deepgram Nova-3...');

  const audioStream = fs.createReadStream(audioPath);

  try {
    const response = await axios.post(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&utterances=true&punctuate=true',
      audioStream,
      {
        headers: {
          Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/wav',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const alternative = response.data?.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative) {
      throw new Error('Invalid response structure from Deepgram API');
    }

    const fullText = alternative.transcript || '';
    const wordTimestamps: WordTimestamp[] = (alternative.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      punctuated_word: w.punctuated_word || w.word,
    }));

    return {
      fullText,
      wordTimestamps,
    };
  } catch (error: any) {
    const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`Deepgram transcription failed: ${errorDetails}`);
  }
}
