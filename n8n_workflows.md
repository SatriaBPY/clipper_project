# n8n Integration Guide for ClipForge

Panduan ini berisi rancangan alur kerja (**workflow**) n8n untuk mengotomatiskan pemrosesan video YouTube menjadi klip pendek menggunakan ClipForge, memperbarui Google Sheets, dan mengunggah hasilnya ke Google Drive secara teratur setiap pukul 15.00 WIB (3 sore).

Untuk keandalan maksimal dan efisiensi sumber daya (karena pembuatan klip memakan waktu beberapa menit), kita akan membagi alur kerja menjadi **2 Workflow**:

1. **Workflow 1: Clipper Trigger (Schedule)** — Berjalan pukul 15:00 WIB, membaca Google Sheets yang berstatus `PENDING`, memicu job pemotongan ke ClipForge, dan menandai status sebagai `PROCESSING`.
2. **Workflow 2: Clipper Callback & Uploader (Webhook)** — Menerima notifikasi dari ClipForge ketika pemotongan selesai, memperbarui status di Google Sheets menjadi `CLIPPED` (jika sukses) atau `FAILED` (jika gagal), mengunduh file video klip, mengunggah ke Google Drive (di folder `Clipper/MM-DD`), dan akhirnya memperbarui status menjadi `UPLOADED`.

---

## Struktur Kolom Google Sheets

Pastikan nama kolom di Google Sheets Anda sudah tepat (case-sensitive) seperti di bawah ini:

- `Tanggal` (Format: `YYYY-MM-DD`, contoh: `2026-07-12`)
- `YouTube URL` (Tautan video YouTube target)
- `Provider` (Pilihan transkripsi: `deepgram` atau `groq` — opsional, default: `deepgram`)
- `Jml Clip` (Jumlah klip yang dihasilkan)
- `Status` (Status alur kerja: `PENDING`, `PROCESSING` (opsional), `CLIPPED`, `UPLOADED`)
- `Video IDs` (Daftar ID klip yang dihasilkan)
- `Last Update` (Waktu pembaruan terakhir)
- `job_id` (ID pekerjaan dari ClipForge untuk pelacakan)

---

## Hubungan Antar Kontainer / Jaringan n8n & ClipForge

Saat memasukkan URL API ClipForge di n8n (`http://<IP_OR_HOST>:3009`):

- Jika **n8n & ClipForge berjalan di host yang sama** (tapi n8n berjalan di Docker sedangkan ClipForge berjalan di Docker Compose default), gunakan alamat berikut untuk memanggil API dari n8n:
  `http://host.docker.internal:3009`
- Jika n8n berjalan di host luar, gunakan alamat IP eksternal server:
  `http://<IP_SERVER_ANDA>:3009`
- Gunakan URL Webhook n8n Anda untuk diisi pada parameter `callback_url` di HTTP Request POST.

---

## Workflow 1: Clipper Trigger (Schedule)

Workflow ini dipicu setiap hari pada pukul **15:00 WIB**, mengambil baris dengan tanggal hari ini yang statusnya masih `PENDING`, memicu API `POST /jobs` di ClipForge, lalu memperbarui status baris tersebut ke `PROCESSING` beserta menyimpan `job_id`.

### Cara Import:

1. Salin seluruh kode JSON di bawah ini.
2. Di n8n, buat workflow baru.
3. Tekan tombol `Ctrl + V` (Windows) atau `Cmd + V` (Mac) langsung di atas canvas n8n untuk menempelkan workflow ini.

```json
{
  "name": "ClipForge - 1. Trigger Scheduler",
  "nodes": [
    {
      "parameters": {
        "rule": "triggerTime",
        "triggerTimes": {
          "value": [
            {
              "hour": 15
            }
          ]
        }
      },
      "id": "schedule-trigger-node",
      "name": "Everyday at 3 PM",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.1,
      "position": [380, 240]
    },
    {
      "parameters": {
        "operation": "read",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "options": {}
      },
      "id": "read-sheets-node",
      "name": "Read Google Sheet",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [600, 240],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const todayStr = $now.setZone('Asia/Jakarta').toFormat('yyyy-MM-dd');\nreturn $input.all().filter(item => {\n  const tanggal = item.json.Tanggal;\n  const status = item.json.Status;\n  const isStatusPending = !status || String(status).trim() === '' || status === 'PENDING' || status === 'pending';\n  return tanggal === todayStr && isStatusPending;\n});"
      },
      "id": "filter-today-jobs",
      "name": "Filter Today's Jobs",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [820, 240]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://host.docker.internal:3009/jobs",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"youtube_url\": \"{{ $json[\"YouTube URL\"] }}\",\n  \"callback_url\": \"http://<YOUR_N8N_DOMAIN_OR_IP>:5678/webhook/clipforge-callback\",\n  \"transcription_provider\": \"{{ ($json.Provider || 'deepgram').toLowerCase().trim() }}\"\n}",
        "options": {}
      },
      "id": "trigger-clipper-job",
      "name": "Trigger Clipper Job",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1040, 240]
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "updateBy": "rowNumber",
        "rowNumber": "={{ $('Filter Today\\'s Jobs').item.json.rowNumber }}",
        "columns.matchingColumns": ["job_id"],
        "fieldsUi": {
          "values": [
            {
              "column": "Status",
              "value": "PROCESSING"
            },
            {
              "column": "job_id",
              "value": "={{ $json.job_id }}"
            },
            {
              "column": "Last Update",
              "value": "={{ $now.toString() }}"
            }
          ]
        },
        "options": {}
      },
      "id": "update-sheet-processing",
      "name": "Update Sheet to Processing",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [1260, 240],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    }
  ],
  "connections": {
    "Everyday at 3 PM": {
      "main": [
        [
          {
            "node": "Read Google Sheet",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Read Google Sheet": {
      "main": [
        [
          {
            "node": "Filter Today's Jobs",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filter Today's Jobs": {
      "main": [
        [
          {
            "node": "Trigger Clipper Job",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Trigger Clipper Job": {
      "main": [
        [
          {
            "node": "Update Sheet to Processing",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionTimeout": 3600
  }
}
```

---

## Workflow 2: Clipper Callback & Uploader (Webhook)

Alur kerja ini dipicu oleh webhook (`POST /webhook/clipforge-callback`) dari ClipForge ketika worker selesai mengolah video.
Alur kerja ini akan:

1. Mencari baris Google Sheet yang memiliki `Job_id` yang cocok.
2. Memeriksa status:
   - Jika **done**:
     - Mengekstrak tanggal untuk membuat folder `Clipper/MM-DD`.
     - Mengunduh klip satu per satu dari ClipForge API secara lokal.
     - Mengunggah ke Google Drive.
     - Memperbarui Google Sheets: Status = `done`, Jumlah Klip, Last Update, dll.
   - Jika **failed**:
     - Memperbarui Google Sheets: Status = `failed`.

### Cara Import:

1. Salin seluruh kode JSON di bawah ini.
2. Di n8n, buat workflow baru.
3. Tempelkan (`Ctrl + V` atau `Cmd + V`) di atas canvas n8n.

```json
{
  "name": "ClipForge - 2. Callback & Drive Upload",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "clipforge-callback",
        "options": {}
      },
      "id": "webhook-trigger-node",
      "name": "Webhook Callback",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [180, 360]
    },
    {
      "parameters": {
        "operation": "read",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "filters": {
          "conditions": [
            {
              "column": "job_id",
              "operator": "equal",
              "value": "={{ $json.body.job_id }}"
            }
          ]
        },
        "options": {}
      },
      "id": "find-sheet-row",
      "name": "Find Sheet Row by Job ID",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [400, 360],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValueString": "",
            "typeString": "string"
          },
          "conditions": [
            {
              "id": "status-is-done",
              "leftValue": "={{ $('Webhook Callback').first().json.body?.status || 'failed' }}",
              "rightValue": "done",
              "operator": "equals"
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "check-job-status",
      "name": "Is Status Done?",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.2,
      "position": [620, 360]
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "updateBy": "rowNumber",
        "rowNumber": "={{ $json.rowNumber }}",
        "columns.matchingColumns": ["job_id"],
        "fieldsUi": {
          "values": [
            {
              "column": "Status",
              "value": "FAILED"
            },
            {
              "column": "Last Update",
              "value": "={{ $now.toString() }}"
            }
          ]
        },
        "options": {}
      },
      "id": "update-sheet-failed",
      "name": "Update Sheet to Failed",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [820, 500],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "updateBy": "rowNumber",
        "rowNumber": "={{ $('Find Sheet Row by Job ID').item.json.rowNumber }}",
        "columns.matchingColumns": ["job_id"],
        "fieldsUi": {
          "values": [
            {
              "column": "Status",
              "value": "CLIPPED"
            },
            {
              "column": "Jml Clip",
              "value": "={{ $('Webhook Callback').item.json.body.clips.length }}"
            },
            {
              "column": "Video IDs",
              "value": "={{ $('Webhook Callback').item.json.body.clips.map(c => c.id).join(', ') }}"
            },
            {
              "column": "Last Update",
              "value": "={{ $now.toString() }}"
            }
          ]
        },
        "options": {}
      },
      "id": "update-sheet-clipped",
      "name": "Update Sheet to Clipped",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [820, 100],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const dateStr = $input.first().json.Tanggal; // Format: yyyy-mm-dd\nlet folderName = 'default-date';\nif (dateStr) {\n  const parts = dateStr.split('-');\n  if (parts.length >= 3) {\n    folderName = `${parts[1]}-${parts[2]}`; // Ambil mm-dd\n  } else {\n    const d = new Date(dateStr);\n    if (!isNaN(d)) {\n      folderName = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');\n    }\n  }\n}\nreturn { json: { folder_name: folderName } };"
      },
      "id": "extract-folder-name",
      "name": "Extract Folder Name (mm-dd)",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1020, 220]
    },
    {
      "parameters": {
        "resource": "file",
        "operation": "list",
        "options": {
          "q": "name = 'Clipper' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        }
      },
      "id": "find-clipper-folder",
      "name": "Find Clipper Folder",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [1220, 220],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "YOUR_GOOGLE_DRIVE_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "resource": "file",
        "operation": "list",
        "options": {
          "q": "=name = '{{ $('Extract Folder Name (mm-dd)').item.json.folder_name }}' and '{{ $json.id }}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        }
      },
      "id": "find-date-folder",
      "name": "Find Date Folder",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [1420, 220],
      "settings": {
        "alwaysOutputData": true
      },
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "YOUR_GOOGLE_DRIVE_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValueString": "",
            "typeString": "string"
          },
          "conditions": [
            {
              "id": "folder-exists",
              "leftValue": "={{ $json.id }}",
              "operator": "isEmpty"
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "check-date-folder",
      "name": "Does Date Folder Exist?",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.2,
      "position": [1620, 220]
    },
    {
      "parameters": {
        "resource": "folder",
        "operation": "create",
        "name": "={{ $('Extract Folder Name (mm-dd)').item.json.folder_name }}",
        "options": {
          "parents": ["={{ $('Find Clipper Folder').item.json.id }}"]
        }
      },
      "id": "create-date-folder",
      "name": "Create Date Folder",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [1820, 140],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "YOUR_GOOGLE_DRIVE_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const webhookData = $('Webhook Callback').first().json;\nconst clips = webhookData.body.clips || [];\nconst jobId = webhookData.body.job_id;\n\nlet targetFolderId = '';\ntry {\n  targetFolderId = $('Does Date Folder Exist?').first().json.id;\n} catch (e) {}\nif (!targetFolderId) {\n  try {\n    targetFolderId = $('Create Date Folder').first().json.id;\n  } catch (e) {}\n}\n\nreturn clips.map(clip => ({\n  json: {\n    ...clip,\n    job_id: jobId,\n    target_folder_id: targetFolderId\n  }\n}));"
      },
      "id": "prepare-loop",
      "name": "Prepare Loop Items",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2050, 220]
    },
    {
      "parameters": {
        "url": "=http://host.docker.internal:3009/storage/{{ $json.job_id }}/clip_{{ $json.id }}.mp4",
        "responseFormat": "file",
        "options": {}
      },
      "id": "download-clip-video",
      "name": "Download Clip Video",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [2250, 220]
    },
    {
      "parameters": {
        "resource": "file",
        "operation": "upload",
        "fileContent": "data",
        "options": {
          "name": "={{ $('Prepare Loop Items').item.json.title }}.mp4",
          "parents": [
            "={{ $('Prepare Loop Items').item.json.target_folder_id }}"
          ]
        }
      },
      "id": "upload-to-gdrive",
      "name": "Upload Clip to Drive",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [2450, 220],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "YOUR_GOOGLE_DRIVE_CREDENTIALS_ID"
        }
      }
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": {
          "__rl": true,
          "mode": "list"
        },
        "sheetName": {
          "__rl": true,
          "mode": "list"
        },
        "updateBy": "rowNumber",
        "rowNumber": "={{ $('Find Sheet Row by Job ID').item.json.rowNumber }}",
        "columns.matchingColumns": ["job_id"],
        "fieldsUi": {
          "values": [
            {
              "column": "Status",
              "value": "UPLOADED"
            },
            {
              "column": "Jml Clip",
              "value": "={{ $('Webhook Callback').item.json.body.clips.length }}"
            },
            {
              "column": "Video IDs",
              "value": "={{ $('Webhook Callback').item.json.body.clips.map(c => c.id).join(', ') }}"
            },
            {
              "column": "Last Update",
              "value": "={{ $now.toString() }}"
            }
          ]
        },
        "options": {}
      },
      "id": "update-sheet-success",
      "name": "Update Sheet to Success",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [2700, 220],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "YOUR_GOOGLE_SHEETS_CREDENTIALS_ID"
        }
      }
    }
  ],
  "connections": {
    "Webhook Callback": {
      "main": [
        [
          {
            "node": "Find Sheet Row by Job ID",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Find Sheet Row by Job ID": {
      "main": [
        [
          {
            "node": "Is Status Done?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Is Status Done?": {
      "main": [
        [
          {
            "node": "Update Sheet to Clipped",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Update Sheet to Failed",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update Sheet to Clipped": {
      "main": [
        [
          {
            "node": "Extract Folder Name (mm-dd)",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Extract Folder Name (mm-dd)": {
      "main": [
        [
          {
            "node": "Find Clipper Folder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Find Clipper Folder": {
      "main": [
        [
          {
            "node": "Find Date Folder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Find Date Folder": {
      "main": [
        [
          {
            "node": "Does Date Folder Exist?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Does Date Folder Exist?": {
      "main": [
        [
          {
            "node": "Prepare Loop Items",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Create Date Folder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Date Folder": {
      "main": [
        [
          {
            "node": "Prepare Loop Items",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Prepare Loop Items": {
      "main": [
        [
          {
            "node": "Download Clip Video",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Download Clip Video": {
      "main": [
        [
          {
            "node": "Upload Clip to Drive",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Upload Clip to Drive": {
      "main": [
        [
          {
            "node": "Update Sheet to Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionTimeout": 3600
  }
}
```

---

## Petunjuk Konfigurasi Penting

### 1. Kredensial Google Sheets & Google Drive

Pada kedua alur kerja di atas, Anda harus mengganti parameter `YOUR_GOOGLE_SHEETS_CREDENTIALS_ID` dan `YOUR_GOOGLE_DRIVE_CREDENTIALS_ID` dengan ID kredensial Google milik Anda yang sudah ada di n8n.

- Buka node Google Sheets/Google Drive yang di-import.
- Pilih akun Google Auth Anda yang terhubung pada kolom **Credential for Google Sheets / Google Drive**.

### 2. Memetakan Spreadsheet

- Pada node **Read Google Sheet**, **Update Sheet to Processing**, **Find Sheet Row by Job ID**, dan **Update Sheet to Success**, pastikan Anda memilih file Spreadsheet target dari dropdown, serta nama Tab Lembar Kerja (Sheet Name) yang sesuai.

### 3. Folder Clipper di Google Drive

- Pastikan Anda sudah memiliki folder bernama `Clipper` di root Google Drive Anda. Alur kerja di atas akan mendeteksi folder bernama `Clipper` ini terlebih dahulu, lalu otomatis membuat subfolder baru di dalamnya bernama sesuai tanggal saat itu (misalnya: `07-12` untuk 12 Juli).

### 4. URL Callback Webhook

- Pada **Workflow 1** di bagian node **Trigger Clipper Job**, ganti `http://<YOUR_N8N_DOMAIN_OR_IP>:5678/webhook/clipforge-callback` dengan URL Webhook n8n production Anda yang tertera pada node **Webhook Callback** di **Workflow 2**.


cURL untuk test manual:
curl -X POST "http://localhost:5678/webhook-test/clipforge-callback" \
    -H "Content-Type: application/json" \
    -d '{
      "job_id": "3b08e867-6780-41c2-b812-97e404f6f664",
      "status": "done",
      "clips": [
        {
          "id": "1",
          "start_time": 25.5,
          "end_time": 55.2,
          "title": "Simulasi Clip 1",
          "reason": "AI matched moment",
          "file_path": "/storage/3b08e867-6780-41c2-b812-97e404f6f664/clip_2c8ddf37-4a9b-4c4e-9055-03aec1b5310d.mp4",
          "status": "done"
        },
        {
          "id": "2",
          "start_time": 100,
          "end_time": 130,
          "title": "Simulasi Clip 2",
          "reason": "AI matched moment 2",
          "file_path": "/storage/3b08e867-6780-41c2-b812-97e404f6f664/clip_13ca7ed8-9ac0-4cc7-880b-72840e2d5df5.mp4",
          "status": "done"
        }
      ]
    }'