# AGENT.md — ClipForge

Dokumen ini adalah aturan main untuk AI coding agent (Antigravity/OpenCode/Qwen Code/Gemini CLI) yang mengerjakan implementasi proyek ClipForge. Baca ini bersama `prd.md` sebelum menulis kode apapun.

## Bootstrap Protocol
Jika menerima command start yang vague (misal: "lanjutkan", "mulai", "kerjain"):
1. Baca seluruh `prd.md` dan `AGENT.md`
2. Cek folder project untuk lihat progress yang sudah ada (file existing, migration, dsb)
3. Output ringkasan terstruktur: apa yang sudah ada, apa yang jadi next logical step
4. Ajukan **satu** pertanyaan konkret untuk konfirmasi sebelum mulai coding (bukan minta klarifikasi umum)

## Governance Gate: implement.md
Sebelum menulis kode non-trivial (fitur baru, perubahan struktur DB, perubahan alur pipeline), agent WAJIB membuat/update `implement.md` berisi:
- Perubahan DB (schema/migration) yang akan dilakukan
- Daftar file yang akan dibuat/diubah
- Dampak ke bagian lain sistem (misal: perubahan format job status mempengaruhi dashboard)
- Estimasi kompleksitas (rendah/sedang/tinggi)

Tunggu tidak perlu approval eksplisit tiap langkah — cukup dokumentasikan, lalu lanjut eksekusi (lihat "Autonomous Execution" di bawah). Dokumen ini adalah jejak audit, bukan gate yang harus di-approve manual satu-satu.

### Trivial Change Exemption
Perubahan berikut TIDAK perlu update `implement.md`:
- Perubahan teks/copy di UI
- Perubahan warna/style CSS minor
- Perubahan default value config yang tidak mempengaruhi struktur data

## Autonomous Execution
Agent bekerja otomatis dengan interupsi minimal. Agent HANYA berhenti untuk minta input Sat jika:
- Ada konflik yang genuinely tidak bisa diselesaikan sendiri (misal: API key Deepgram/OpenRouter belum diisi di `.env`)
- Keputusan yang berdampak besar ke arsitektur dan tidak tercakup di `prd.md`

Untuk hal lain (pilihan implementasi detail, struktur file, penamaan variable), agent boleh ambil keputusan sendiri berdasarkan best practice dan konsisten dengan stack yang sudah ditentukan.

## Single Source of Truth
`prd.md` harus di-update terlebih dahulu SEBELUM fitur baru diimplementasikan, jika ada perubahan scope. Jangan implementasi fitur yang tidak tercantum di `prd.md` tanpa update dokumen dulu.

## Tech Stack (WAJIB diikuti, jangan ganti tanpa diskusi)
- Backend: Fastify + TypeScript
- Queue: BullMQ + Redis
- Database: SQLite + Prisma
- Dashboard: Next.js 14 (App Router)
- Video processing: ffmpeg (via child_process atau fluent-ffmpeg)
- Download: yt-dlp (via child_process wrapper)
- Transkripsi: Deepgram API
- LLM: OpenRouter API (model default: `anthropic/claude-sonnet-4.6`, configurable via `.env`)

## Deployment: Docker
Semua service WAJIB dikemas dalam `docker-compose.yml`, terdiri dari minimal service berikut:
- `api` — Fastify (endpoint job + webhook)
- `worker` — proses BullMQ (download, transkripsi, cutting, caption burn)
- `dashboard` — Next.js
- `redis` — BullMQ broker

Volume `STORAGE_PATH` di-mount sebagai bind mount ke host (bukan named volume), supaya file gampang diakses/dibersihkan manual kalau perlu. SQLite file juga di bind mount, bukan disimpan di dalam container layer.

## Hardware Constraint (Core i3 Gen 2, 10GB RAM, 128GB SSD)
Karena berjalan di hardware lama tanpa GPU:
- ffmpeg encoding WAJIB pakai `-preset veryfast` (atau `ultrafast` kalau masih terlalu lambat), codec `libx264`, resolusi output di-cap max 720p
- Cutting tanpa re-encode kalau memungkinkan (`-c copy`), hanya re-encode di tahap burn-caption yang memang butuh re-render
- Worker BullMQ **concurrency di-set 1** (jangan proses beberapa video processing job paralel) — CPU 2 core/4 thread nggak akan sanggup multi-job barengan, lebih baik antre
- Setelah job status `done`, **raw downloaded video (source asli) harus dihapus otomatis** dari `STORAGE_PATH`, sisakan hanya file transcript JSON dan klip hasil akhir — kritikal karena SSD cuma 128GB

## API & Webhook (dipanggil n8n / agent eksternal)
- `POST /jobs` terima `youtube_url` dan `callback_url` opsional — implementasikan sesuai kontrak di `prd.md` section 6
- Kalau `callback_url` diisi, worker WAJIB melakukan HTTP POST ke situ saat job selesai (`done`/`failed`) dengan retry sederhana (2-3x) kalau callback gagal — jangan biarkan kegagalan callback bikin job dianggap gagal
- Endpoint tidak perlu auth di MVP (asumsi jaringan lokal/VPN) — tapi JANGAN hardcode asumsi ini ke tempat yang susah diubah; taruh di config supaya gampang nambah API key header kalau nanti diekspos ke publik

## Environment Variables (harus ada di `.env.example`)
```
DEEPGRAM_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
DATABASE_URL=file:./dev.db
REDIS_URL=redis://localhost:6379
STORAGE_PATH=./storage
PORT=3001
FFMPEG_PRESET=veryfast
MAX_OUTPUT_RESOLUTION=720
```

## Coding Standards
- Semua job video processing (download, transkripsi, cutting, caption burn) HARUS berjalan sebagai BullMQ job, bukan blocking request langsung dari API endpoint
- Setiap job HARUS punya status tracking di DB: `pending`, `downloading`, `transcribing`, `analyzing`, `cutting`, `captioning`, `done`, `failed`
- Error di satu stage tidak boleh crash seluruh worker — catch, log, update status `failed` dengan pesan error, lanjut proses job lain
- File hasil (video, transcript, subtitle) disimpan di `STORAGE_PATH/{job_id}/`

## Catatan Khusus
- Ini adalah personal tool, single-user — JANGAN tambahkan auth/login system kecuali diminta eksplisit
- Prioritaskan working end-to-end pipeline dulu di atas polish UI dashboard
- Kalau ffmpeg command gagal, log full stderr — jangan swallow error, karena debugging ffmpeg tanpa detail error itu menyakitkan
