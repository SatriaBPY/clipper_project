# PRD: ClipForge — Auto Podcast Clipper

## 1. Overview
ClipForge adalah personal tool untuk mengubah video podcast YouTube panjang menjadi klip-klip pendek ("best moments") lengkap dengan caption otomatis. Tool ini dijalankan secara lokal oleh satu user (Sat), tanpa kebutuhan multi-tenant, auth, atau deployment publik.

## 2. Goals
- Input: URL YouTube podcast
- Output: beberapa file video pendek (1-3 menit) dengan burned-in caption, siap upload ke Shorts/Reels/TikTok
- Proses end-to-end otomatis, minim intervensi manual
- Bisa jalan di local machine / VPS pribadi milik Sat

## 3. Non-Goals (di luar scope MVP)
- Tidak ada multi-user, auth, billing
- Tidak ada auto-reframe vertical (face-tracking) — landscape/crop statis dulu
- Tidak ada animated word-by-word caption — caption statis per-segmen dulu
- Tidak ada UI upload publik — trigger via CLI atau dashboard lokal sederhana

## 4. User & Use Case
**User:** Sat (personal use)
**Flow:** Sat paste link YouTube podcast → sistem download, transkrip, deteksi best moment, potong video, burn caption → Sat review hasil di dashboard lokal → download/pakai clip yang bagus.

## 5. Deployment Target & Constraint Hardware
Dijalankan di server pribadi (Core i3 Gen 2, 10GB RAM, 128GB SSD, Xubuntu) via **Docker Compose**. Karena hardware terbatas:
- Semua service (Fastify API, Next.js dashboard, Redis, worker) di-containerize, jalan sebagai background service — tidak perlu machine utama Sat nyala
- Encoding ffmpeg pakai preset `veryfast`/`ultrafast`, target resolusi output max 720p (menyesuaikan CPU lama, no hardware encoding)
- Raw video hasil download **wajib dihapus otomatis** setelah semua klip selesai diproses (128GB SSD terbatas) — hanya transcript (teks) dan klip hasil akhir yang disimpan permanen
- Karena tidak ada GPU, transkripsi & LLM tetap via cloud API (Deepgram, OpenRouter) — bukan self-hosted

## 6. Integrasi Eksternal (n8n / agent lain)
ClipForge harus bisa dipanggil sebagai service dari workflow automation eksternal (n8n) atau agent lain, bukan cuma dipakai manual lewat dashboard.

**API Contract (Fastify):**
- `POST /jobs` — body: `{ "youtube_url": string, "callback_url"?: string }` → return `{ "job_id": string }`
- `GET /jobs/:id` — return status job + list clip (kalau sudah selesai)
- `GET /jobs/:id/clips` — return daftar file klip + metadata (title, reason, path/url)
- **Webhook callback** (opsional): kalau `callback_url` diisi saat create job, ClipForge POST balik ke URL itu saat job `done` atau `failed`, payload: `{ "job_id", "status", "clips": [...] }` — ini yang dipanggil n8n/agent buat lanjut workflow otomatis (misal auto-post ke platform lain)
- Semua endpoint tanpa auth di MVP (asumsi jaringan internal/VPN, bukan exposed ke publik). Kalau nanti expose ke internet, wajib tambah API key sederhana di header.

## 7. Arsitektur Tech Stack

| Layer | Teknologi | Alasan |
|---|---|---|
| Download video/audio | yt-dlp | Standard, reliable, banyak format support |
| Video processing | ffmpeg | Cutting, extract audio, burn subtitle |
| Transkripsi | Deepgram API (Nova-3) | Word-level timestamp, tanpa perlu GPU lokal, murah utk volume personal |
| Best moment detection | OpenRouter API (default: Claude Sonnet) | Model swappable via config, tidak lock-in ke satu provider |
| Caption rendering | ASS subtitle format + ffmpeg | Styling caption tanpa perlu Remotion (defer ke fase depan) |
| Backend/API | Fastify + TypeScript | Konsisten dgn stack Sat |
| Queue | BullMQ + Redis | Job video processing bisa lama, perlu async + retry |
| Database | SQLite + Prisma | Personal tool, single-user — hindari overhead Postgres container nyala terus |
| Dashboard | Next.js 14 (App Router) | Review hasil clip, trigger job baru |
| Storage | Local filesystem (VPS/lokal) | Belum perlu R2/cloud storage utk personal use |

## 8. Pipeline Detail

1. **Input & Download**
   - User submit URL YouTube via dashboard/CLI
   - `yt-dlp` download video (best quality landscape) + extract audio terpisah (wav 16kHz mono)

2. **Transkripsi**
   - Audio dikirim ke Deepgram API
   - Simpan hasil: full transcript + word-level timestamps (JSON) ke DB

3. **Best Moment Detection**
   - Transcript lengkap + timestamp dikirim ke LLM via OpenRouter
   - Prompt minta output JSON: array segmen `{start_time, end_time, title, reason}`
   - Kriteria segmen: self-contained (tidak motong konteks), ada hook/insight/emosi, durasi 30-180 detik
   - Default ambil top 5-10 segmen per video

4. **Cutting**
   - `ffmpeg` potong video sesuai timestamp tiap segmen terpilih
   - Output: file per klip, landscape (tanpa reframe vertical di MVP)

5. **Caption Generation**
   - Convert word-timestamp jadi file `.ass` per klip (style: font besar, posisi bawah, warna kontras)
   - Burn caption ke video pakai `ffmpeg`

6. **Review**
   - Dashboard Next.js list semua job & klip hasil, preview video, lihat alasan LLM pilih segmen tsb
   - Manual delete/keep clip

## 9. Data Model (garis besar)
- `Job`: id, youtube_url, status, created_at
- `Transcript`: job_id, full_text, word_timestamps (JSON)
- `Clip`: job_id, start_time, end_time, title, reason, file_path, status

## 10. Success Criteria (MVP)
- End-to-end: paste URL → dapat minimal 3 klip dengan caption dalam < 15 menit (video podcast ~30-60 menit)
- Caption terbaca jelas, sinkron dengan audio
- Minimal 60% klip yang dipilih LLM dianggap "layak upload" oleh Sat (validasi manual)

## 11. Fase Selanjutnya (Post-MVP)
- Auto-reframe vertical 9:16 dengan face-tracking (OpenCV/MediaPipe)
- Animated word-by-word caption (Remotion atau ASS animasi advanced)
- Migrasi transkripsi ke self-hosted WhisperX jika volume tinggi (cost saving)
- Auto-publish ke platform (YouTube Shorts/TikTok API) jika mau full-otomatis
