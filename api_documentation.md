# API Documentation & n8n Integration Guide — ClipForge

Dokumen ini berisi spesifikasi API ClipForge yang berjalan secara lokal di port `3009`. Dokumen ini dirancang untuk memudahkan Anda membuat alur integrasi (*workflow*) otomatis menggunakan n8n.

---

## 1. Spesifikasi Endpoint API

Semua request dikirim ke base URL: **`http://<IP_LAPTOP_ANDA>:3009`** (jika diakses dari luar container/host lain) atau **`http://localhost:3009`** (jika diakses dari laptop host sendiri).

### 1.1. Create Clipper Job (`POST /jobs`)
Digunakan untuk memasukkan URL YouTube baru ke dalam antrean Clipper.

*   **URL**: `/jobs`
*   **Method**: `POST`
*   **Headers**:
    *   `Content-Type: application/json`
*   **JSON Body**:
    ```json
    {
      "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "callback_url": "https://<N8N_WEBHOOK_URL>/webhook/clipforge-callback",
      "transcription_provider": "deepgram"
    }
    ```
    *   `youtube_url` *(string, wajib)*: Tautan video YouTube target.
    *   `callback_url` *(string, opsional)*: URL webhook n8n yang akan dipanggil otomatis oleh ClipForge saat proses pemotongan selesai/gagal.
    *   `transcription_provider` *(string, opsional)*: Pilihan provider AI transkripsi. Nilai: `"deepgram"` *(default)* atau `"groq"`.
*   **Response (200 OK)**:
    ```json
    {
      "job_id": "bc5a4633-3b6c-4dbe-87bc-081b8973289e"
    }
    ```

---

### 1.2. Get Job Status (`GET /jobs/:id`)
Digunakan untuk memantau status pengerjaan secara manual (jika Anda tidak menggunakan `callback_url`).

*   **URL**: `/jobs/:id` (ganti `:id` dengan `job_id`)
*   **Method**: `GET`
*   **Response (200 OK)**:
    ```json
    {
      "id": "bc5a4633-3b6c-4dbe-87bc-081b8973289e",
      "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "callback_url": "https://...",
      "transcription_provider": "deepgram",
      "status": "done",
      "error": null,
      "created_at": "2026-07-11T21:40:00.000Z",
      "updated_at": "2026-07-11T21:44:00.000Z",
      "clips": [
        {
          "id": "clip-uuid-1",
          "start_time": 25.5,
          "end_time": 55.2,
          "title": "Rahasia Sukses Coding",
          "reason": "Momen ini menceritakan tentang...",
          "file_path": "/usr/src/app/storage/bc5a4633-.../clip_clip-uuid-1.mp4",
          "status": "done",
          "error": null
        }
      ]
    }
    ```
    *   **Nilai `status` Job**: `pending` $\rightarrow$ `downloading` $\rightarrow$ `transcribing` $\rightarrow$ `analyzing` $\rightarrow$ `cutting` $\rightarrow$ `done` atau `failed`.

---

### 1.3. Get Job Clips List (`GET /jobs/:id/clips`)
Digunakan untuk mengambil daftar klip yang berhasil diproduksi beserta url unduhan langsungnya.

*   **URL**: `/jobs/:id/clips`
*   **Method**: `GET`
*   **Response (200 OK)**:
    ```json
    [
      {
        "id": "clip-uuid-1",
        "job_id": "bc5a4633-3b6c-4dbe-87bc-081b8973289e",
        "start_time": 25.5,
        "end_time": 55.2,
        "title": "Rahasia Sukses Coding",
        "reason": "Momen ini menceritakan...",
        "file_path": "/usr/src/app/storage/bc5a4633-.../clip_clip-uuid-1.mp4",
        "url": "/storage/bc5a4633-3b6c-4dbe-87bc-081b8973289e/clip_clip-uuid-1.mp4",
        "status": "done",
        "error": null
      }
    ]
    ```
    *   **Catatan**: Tautan unduhan penuh untuk klip video di atas adalah:
        `http://<IP_LAPTOP_ANDA>:3009/storage/bc5a4633-3b6c-4dbe-87bc-081b8973289e/clip_clip-uuid-1.mp4`

---

## 2. Struktur Webhook Callback

Jika parameter `callback_url` diisi saat membuat Job, ClipForge akan mengirimkan payload HTTP POST otomatis ketika seluruh proses selesai atau gagal.

### 2.1. Payload Webhook Selesai (`status: "done"`)
```json
{
  "job_id": "bc5a4633-3b6c-4dbe-87bc-081b8973289e",
  "status": "done",
  "clips": [
    {
      "id": "clip-uuid-1",
      "start_time": 25.5,
      "end_time": 55.2,
      "title": "Rahasia Sukses Coding",
      "reason": "Alasan AI memilih momen ini...",
      "file_path": "/usr/src/app/storage/bc5a4633-.../clip_clip-uuid-1.mp4",
      "status": "done"
    }
  ]
}
```

### 2.2. Payload Webhook Gagal (`status: "failed"`)
```json
{
  "job_id": "bc5a4633-3b6c-4dbe-87bc-081b8973289e",
  "status": "failed",
  "clips": []
}
```

---

## 3. Panduan Setup Node di n8n

Untuk mengotomatisasi penyebaran video klip ini ke media sosial (seperti Telegram, TikTok, Shorts, dll.), buat workflow n8n sebagai berikut:

### Langkah 1: Node Webhook (Penerima Hasil)
1.  Buat node **Webhook** di n8n.
2.  Set **HTTP Method** menjadi `POST`.
3.  Salin tautan **Webhook URL** (gunakan yang production/test sesuai kebutuhan). Tautan ini yang akan disubmit sebagai `callback_url` di API.

### Langkah 2: Node HTTP Request (Pemicu/Trigger)
1.  Buat node **HTTP Request**.
2.  Set **Method** menjadi `POST`.
3.  Set **URL** ke `http://<IP_LAPTOP_ANDA>:3009/jobs`.
4.  Masukkan JSON body yang berisi tautan YouTube dan menyematkan `callback_url` dari Langkah 1.

### Langkah 3: Node Loop & Download Video (Pasca-Webhook)
Ketika webhook menerima callback dari ClipForge:
1.  Gunakan node **Loop Over Items** untuk memproses array `clips` satu per satu.
2.  Gunakan node **HTTP Request** baru di dalam loop untuk mengunduh file video:
    *   **Method**: `GET`
    *   **URL**: `http://<IP_LAPTOP_ANDA>:3009/storage/{{$json.job_id}}/clip_{{$json.id}}.mp4`
    *   **Response Format**: `File` (Binary)
3.  Setelah binary didapatkan, sambungkan ke node pengirim (misal: **Telegram** -> Send Video, atau **TikTok** -> Upload Video).
