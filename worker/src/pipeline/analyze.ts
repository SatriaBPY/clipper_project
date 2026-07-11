import axios from 'axios';
import { config } from '../config';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

interface Segment {
  start_time: number;
  end_time: number;
  title: string;
  reason: string;
}

// Helper untuk format timestamps menjadi teks ber-timestamp
export function formatTranscript(words: WordTimestamp[]): string {
  if (words.length === 0) return '';

  let result = '';
  let currentSentence: string[] = [];
  let sentenceStart = words[0].start;

  for (let i = 0; i < words.length; i++) {
    const wordObj = words[i];
    const wordText = wordObj.punctuated_word || wordObj.word;
    currentSentence.push(wordText);

    const hasEndPunctuation = /[.!?]$/.test(wordText);
    const isNextWordFar = i < words.length - 1 && words[i + 1].start - wordObj.end > 1.5;

    if (hasEndPunctuation || isNextWordFar || i === words.length - 1) {
      const sentenceText = currentSentence.join(' ');
      result += `[${sentenceStart.toFixed(2)}] ${sentenceText}\n`;
      
      // Reset untuk kalimat berikutnya
      if (i < words.length - 1) {
        currentSentence = [];
        sentenceStart = words[i + 1].start;
      }
    }
  }

  return result;
}

export async function analyzeTranscript(
  words: WordTimestamp[],
  onProgress: (status: string) => void
): Promise<Segment[]> {
  if (!config.NINEROUTER_KEY) {
    throw new Error('NINEROUTER_KEY is not set in environment variables');
  }

  onProgress('Formatting transcript for LLM analysis...');
  const formattedText = formatTranscript(words);

  onProgress(`Calling NineRouter LLM (${config.NINEROUTER_MODEL}) to detect best moments...`);

  const prompt = `
Anda adalah produser konten video pendek profesional (TikTok, YouTube Shorts, Instagram Reels).
Tugas Anda adalah menganalisis transkrip podcast berikut dan memilih 3 sampai 10 momen terbaik ("best moments" / "clips") yang paling menarik untuk dijadikan video pendek terpisah.

Kriteria pemilihan segmen:
1. Menarik (mengandung hook yang kuat di awal, insight berharga, kontroversi, humor, atau emosi tinggi).
2. Self-contained (pesan/ide tersampaikan utuh dari awal sampai akhir, tidak terputus secara canggung).
3. Durasi setiap segmen harus berkisar antara 30 hingga 180 detik (0.5 - 3 menit).

Format input transkrip menggunakan tanda kurung siku untuk waktu mulai kalimat dalam detik, misalnya: [12.50] Ini adalah kalimat.

Harap berikan respons HANYA dalam format JSON valid berupa array objek dengan struktur berikut tanpa penjelasan tambahan di luar JSON:
[
  {
    "start_time": <float_dalam_detik>,
    "end_time": <float_dalam_detik>,
    "title": "<judul_klip_yang_catchy_dan_menarik>",
    "reason": "<alasan_mengapa_momen_ini_menarik>"
  }
]

Berikut adalah transkripnya:
${formattedText}
`;

  try {
    const endpoint = `${config.NINEROUTER_URL.replace(/\/$/, '')}/chat/completions`;
    const response = await axios.post(
      endpoint,
      {
        model: config.NINEROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert video producer and editor. You only output valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${config.NINEROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/google-deepmind/clipforge', // Optional site URL
          'X-Title': 'ClipForge', // Optional site name
        },
      }
    );

    let content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from NineRouter');
    }

    // Bersihkan codeblock markdown jika ada
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    // Parse JSON
    // LLM terkadang mengembalikan key yang dibungkus objek bersarang (misal { "clips": [...] } atau langsung array)
    let segments: Segment[] = [];
    const parsedData = JSON.parse(content);
    
    if (Array.isArray(parsedData)) {
      segments = parsedData;
    } else if (parsedData.clips && Array.isArray(parsedData.clips)) {
      segments = parsedData.clips;
    } else if (parsedData.segments && Array.isArray(parsedData.segments)) {
      segments = parsedData.segments;
    } else {
      throw new Error('JSON structure did not contain a valid array of segments');
    }

    // Validasi & sanitasi segment
    const validatedSegments = segments.filter((s) => {
      return typeof s.start_time === 'number' && typeof s.end_time === 'number' && s.end_time > s.start_time;
    });

    if (validatedSegments.length === 0) {
      throw new Error('No valid segments detected by the LLM');
    }

    return validatedSegments;
  } catch (error: any) {
    const errorDetails = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    throw new Error(`NineRouter analysis failed: ${errorDetails}`);
  }
}
