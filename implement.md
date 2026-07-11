# Rencana Implementasi: ClipForge

Dokumen ini merinci langkah-langkah implementasi awal untuk ClipForge sesuai dengan PRD dan aturan main AGENT.md.

## 1. Perubahan DB (Schema/Migration)
Kami akan menggunakan SQLite dan Prisma. Lokasi schema akan berada di root `/prisma/schema.prisma`.

### Skema Prisma (Terbuka untuk Groq Whisper)
Kami menambahkan field `transcriptionProvider` pada model `Job` untuk menandai provider transkripsi yang digunakan (`deepgram` atau `groq`).

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Job {
  id                    String      @id @default(uuid())
  youtubeUrl            String
  callbackUrl           String?
  transcriptionProvider String      @default("deepgram") // "deepgram" atau "groq"
  status                String      // pending, downloading, transcribing, analyzing, cutting, captioning, done, failed
  error                 String?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  transcript            Transcript?
  clips                 Clip[]
}

model Transcript {
  id             String   @id @default(uuid())
  jobId          String   @unique
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  fullText       String
  wordTimestamps String   // JSON stringified array [{word, start, end, confidence}]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Clip {
  id        String   @id @default(uuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  startTime Float
  endTime   Float
  title     String
  reason    String
  filePath  String?
  status    String   // pending, processing, done, failed
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 2. Struktur Folder & Daftar File
Monorepo akan dibagi menjadi beberapa komponen utama:
- Root: konfigurasi global, `.env.example`, `docker-compose.yml`, `prisma/`
- `/api`: Fastify API Server (TypeScript)
- `/worker`: BullMQ Worker (TypeScript) + integration logic (yt-dlp, Deepgram, Groq Whisper, OpenRouter, ffmpeg)
- `/dashboard`: Next.js (TypeScript, App Router)
- `/storage`: Direktori lokal (bind mount) untuk menampung data unduhan dan klip

### Daftar File Utama yang Akan Dibuat / Diubah
1. **Root Configuration & Database:**
   - `/.env.example` (Tambah `GROQ_API_KEY` dan `DEFAULT_TRANSCRIPTION_PROVIDER`)
   - `/prisma/schema.prisma` (Tambah `transcriptionProvider` ke model `Job`)
2. **Fastify API (/api):**
   - `/api/src/config.ts` (Tambah default config)
   - `/api/src/routes/jobs.ts` (Ubah endpoint POST untuk menerima `transcription_provider` di body dan menyimpannya di DB & queue)
3. **BullMQ Worker (/worker):**
   - `/worker/src/config.ts` (Tambah `GROQ_API_KEY`, ganti `OPENROUTER_*` dengan `NINEROUTER_KEY`, `NINEROUTER_MODEL`, dan `NINEROUTER_URL`)
   - `/worker/src/index.ts` (Terima `transcriptionProvider` dari payload queue dan kirim ke pipeline transkripsi)
   - `/worker/src/pipeline/transcribe.ts` (Tambahkan cabang kondisi untuk memanggil Groq API `whisper-large-v3` menggunakan Axios + FormData dengan response format `verbose_json` dan granularity `word`)
   - `/worker/src/pipeline/analyze.ts` (Migrasikan pemanggilan LLM dari OpenRouter API ke NineRouter API menggunakan endpoint, key, dan model NineRouter yang dikonfigurasi)
4. **Next.js Dashboard (/dashboard):**
   - `/dashboard/src/app/page.tsx` (Tambahkan opsi dropdown/radio pilihan provider transkripsi di form "New Clipper Job" dan kirim ke backend)

## 3. Dampak ke Bagian Lain Sistem
- **Skema DB:** Perlu menjalankan `npx prisma db push` untuk memperbarui skema SQLite lokal.
- **Payload Queue:** Payload BullMQ kini menyertakan `transcriptionProvider`.
- **Integrasi Groq API:** Groq membatasi ukuran file audio (maks 25MB biasanya). Jika file audio wav hasil ekstraksi terlalu besar, kita mungkin perlu melakukan kompresi mp3/m4a atau membatasi durasi. Namun untuk podcast rata-rata, kita coba kirim audio wav atau sesuaikan format output ekstraksi audio jika diperlukan (misalnya mengompres audio ke mp3/m4a dengan bitrate rendah).
  > [!TIP]
  > Untuk menghemat bandwith dan mematuhi batas ukuran file Groq API (25MB), kita bisa mengonversi audio ke mp3 mono 64k alih-alih wav mono 16kHz jika menggunakan Groq. Atau kita buat output audio default saat ekstraksi menggunakan format mp3 yang lebih efisien di worker.

## 4. Estimasi Kompleksitas
- Penambahan pilihan provider di UI/API: **Rendah**
- Integrasi Groq Whisper API (FormData + parsing verbose_json): **Sedang**
- Skema DB Migration: **Rendah**

## 5. Rencana Eksekusi
1. Update `prisma/schema.prisma` dan sinkronkan dengan database via `npx prisma db push`.
2. Update config di `/api` dan `/worker` untuk memuat variabel env Groq.
3. Implementasikan pencabangan transkripsi di `/worker/src/pipeline/transcribe.ts` untuk mendukung Deepgram dan Groq.
4. Update `/api/src/routes/jobs.ts` untuk menangani field `transcription_provider`.
5. Update Dashboard UI `/dashboard/src/app/page.tsx` agar user bisa memilih provider.
6. Lakukan pengujian pipeline secara manual.
