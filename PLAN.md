# MCP Server + Chrome Extension Plan
## Google Ads Keyword Planner Data Extraction

---

## BATASAN PENTING (CONSTRAINTS)

### ⚠️ WAJIB DIPATUHI - JANGAN DILANGGAR!

1. **TIDAK BOLEH MENYIMPAN CREDENTIAL APAPUN**
   - ❌ JANGAN pernah commit `.env` ke git
   - ❌ JANGAN hardcode password, API key, atau token di source code
   - ❌ JANGAN log credential di console atau file log
   - ✅ Gunakan environment variables untuk semua sensitive data
   - ✅ Credential hanya disimpan di server VPS (bukan di repository)

2. **TIDAK BOLEH MENGUBAH APLIKASI EXISTING DI VPS**
   - ❌ JANGAN modify container `modalhp-app`
   - ❌ JANGAN modify container `modalhp-api-api`
   - ❌ JANGAN stop/restart container existing
   - ❌ JANGAN ubah konfigurasi Traefik yang sudah ada
   - ❌ JANGAN ubah docker-compose existing
   - ✅ Deploy sebagai container BARU dan TERPISAH
   - ✅ Hanya tambahkan container baru dengan label Traefik

3. **TIDAK BOLEH MENGGANGGU SERVICE YANG BERJALAN**
   - ❌ JANGAN ubah port yang sudah digunakan (80, 443, 3000)
   - ❌ JANGAN modify network `web` existing
   - ❌ JANGAN restart Traefik atau Docker
   - ✅ MCP Server gunakan port berbeda (4000)
   - ✅ Gunakan network `web` yang sudah ada (read-only)

4. **ISOLASI PENUH**
   - MCP Server harus berjalan di container terpisah
   - Tidak ada shared volume dengan container existing
   - Tidak ada dependency ke container modalhp

---

## ARSITEKTUR EXISTING (JANGAN DISENTUH!)

```
┌─────────────────────────────────────────────────────┐
│                    VPS (72.62.127.3)                │
│                                                     │
│  Traefik (port 80, 443) - JANGAN DIUBAH!           │
│  ├── → modalhp-app:80 (modalhp.com)                │
│  └── → modalhp-api-api:3000                        │
│                                                     │
│  ──────────────────────────────────────────────     │
│  NEW (Aman, Terpisah):                             │
│  ├── mcp-seo-server:4000 (seo.modalhp.com)         │
│  └── Chrome Extension ←HTTPS→ MCP Server           │
└─────────────────────────────────────────────────────┘
```

---

## STRUKTUR PROJECT

```
MCP SEO/
├── PLAN.md                   # File ini
├── .gitignore                # Pastikan .env masuk gitignore
├── server/                   # MCP Server source code
│   ├── Dockerfile            # Build image MCP Server
│   ├── src/
│   │   ├── index.ts          # Entry point MCP
│   │   ├── api.ts            # Express API endpoint
│   │   └── tools.ts          # MCP tools definition
│   ├── package.json
│   ├── .env.example          # Template (TANPA nilai asli!)
│   └── .env                  # JANGAN COMMIT! (gitignore)
│
├── extension/                # Chrome Extension source
│   ├── src/
│   │   ├── manifest.json     # Manifest V3
│   │   ├── content.ts        # Script extract tabel Google Ads
│   │   ├── background.ts     # Service worker
│   │   └── popup/            # UI konfigurasi
│   └── package.json
│
└── docker/                   # Deployment files
    ├── docker-compose.yml    # Deploy MCP Server
    └── .env                  # JANGAN COMMIT!
```

---

## FASE 1: SETUP MCP SERVER

### 1.1 Dependencies
```json
{
  "name": "mcp-seo-server",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0"
  }
}
```

### 1.2 Environment Variables (.env)
```env
# JANGAN COMMIT FILE INI!
PORT=4000
API_KEY=<generate-random-string-di-server>
NODE_ENV=production
```

### 1.3 MCP Tools
| Tool Name | Deskripsi |
|-----------|-----------|
| `extractKeywordData` | Terima data keyword dari extension |
| `analyzeKeywords` | Analisis keyword (volume, competition, CPC) |
| `getHistoricalData` | Ambil data historis keyword |

---

## FASE 2: CHROME EXTENSION

### 2.1 Manifest V3
```json
{
  "manifest_version": 3,
  "name": "Google Ads Keyword Extractor",
  "version": "1.0.0",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://ads.google.com/*"],
  "content_scripts": [
    {
      "matches": ["https://ads.google.com/aw/keywordplanner/*"],
      "js": ["dist/content.js"]
    }
  ],
  "background": {
    "service_worker": "dist/background.js"
  },
  "action": {
    "default_popup": "src/popup/index.html"
  }
}
```

### 2.2 Data yang Diekstrak dari Tabel
- Keyword
- Avg. monthly searches (search volume)
- Competition (level kompetisi)
- Top of page bid (low range)
- Top of page bid (high range)
- Ad impression share
- Search trend (jika ada)
- Kategori/Intent (jika ada)

### 2.3 Flow Ekstraksi
```
1. User buka halaman Google Ads Keyword Planner
2. Content script detect URL pattern
3. Script cari tabel data di DOM
4. Extract semua baris + kolom
5. Inject button "Send to MCP Server"
6. User klik button → kirim data via POST
7. Background script handle request ke MCP Server
8. Show notification status (success/error)
```

---

## FASE 3: DEPLOYMENT (AMAN)

### 3.1 Docker Compose Configuration
```yaml
# docker-compose.yml
services:
  mcp-seo-server:
    image: mcp-seo-server:latest
    build:
      context: ../server
      dockerfile: Dockerfile
    restart: always
    expose:
      - "4000"
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp-seo.rule=Host(`seo.modalhp.com`)"
      - "traefik.http.routers.mcp-seo.entrypoints=websecure"
      - "traefik.http.routers.mcp-seo.tls=true"
      - "traefik.http.routers.mcp-seo.tls.certresolver=letsencrypt"
      - "traefik.http.services.mcp-seo.loadbalancer.server.port=4000"
    environment:
      - PORT=4000
      - API_KEY=${API_KEY}
      - NODE_ENV=production

networks:
  web:
    external: true
```

### 3.2 Deployment Steps
```bash
# 1. Upload code ke VPS
scp -r server/ root@72.62.127.3:/root/mcp-seo/server/
scp -r extension/ root@72.62.127.3:/root/mcp-seo/extension/
scp docker/docker-compose.yml root@72.62.127.3:/root/mcp-seo/

# 2. Generate API Key (DI SERVER VPS!)
API_KEY=$(openssl rand -hex 32)

# 3. Buat .env file di VPS
echo "API_KEY=$API_KEY" > /root/mcp-seo/.env

# 4. Build dan deploy
cd /root/mcp-seo
docker-compose up -d --build

# 5. Cek status
docker-compose ps
docker logs mcp-seo-server
```

### 3.3 Verifikasi (Tanpa Mengganggu Existing)
```bash
# Cek container running - modalhp tetap aman
docker ps

# Expected output:
# CONTAINER ID   IMAGE             STATUS
# xxx            mcp-seo-server    Up (NEW!)
# yyy            modalhp-app       Up (unchanged)
# zzz            modalhp-api-api   Up (unchanged)
# aaa            traefik           Up (unchanged)

# Test endpoint
curl https://seo.modalhp.com/api/health
```

---

## FASE 4: TESTING

### 4.1 Test API Endpoint
```bash
# Health check
curl https://seo.modalhp.com/api/health

# Test POST dengan API Key
curl -X POST https://seo.modalhp.com/api/keywords \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test keyword"]}'
```

### 4.2 Test Chrome Extension
1. Buka Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Pilih folder `extension/`
5. Buka https://ads.google.com/aw/keywordplanner/...
6. Verify button "Send to MCP Server" muncul
7. Klik button, verify data terkirim

### 4.3 Test MCP Connection
```bash
# Verify MCP server running
docker logs mcp-seo-server

# Test MCP tools
# (Connect via Claude Desktop / MCP client)
```

---

## KEAMANAN

### Authentication Flow
```
Chrome Extension
      │
      │ POST /api/keywords
      │ Header: Authorization: Bearer <API_KEY>
      ▼
MCP Server (verify API Key)
      │
      │ Valid? → Process
      │ Invalid? → 401 Unauthorized
      ▼
Response
```

### Security Checklist
- [ ] API Key di environment variable (bukan di code)
- [ ] HTTPS only (Traefik auto-redirect)
- [ ] CORS configured untuk chrome-extension://
- [ ] Rate limiting untuk prevent abuse
- [ ] Input validation untuk semua endpoint
- [ ] No credential logging

---

## TROUBLESHOOTING

### Container tidak start
```bash
docker logs mcp-seo-server
docker inspect mcp-seo-server
```

### SSL tidak working
```bash
# Cek Traefik logs
docker logs traefik-traefik-1

# Cek certificate
ls -la /var/lib/docker/volumes/traefik-letsencrypt/
```

### Extension tidak connect
```bash
# Cek CORS di browser console
# Verify API Key di .env
# Test manual dengan curl
```

---

## DOKUMENTASI TAMBAHAN

### URL Pattern Google Ads Keyword Planner
```
https://ads.google.com/aw/keywordplanner/plan/keywords/historical?*
```

### Selector Tabel (mungkin berubah)
```javascript
// Table container (perlu inspection real-time)
document.querySelector('table[aria-label*="keyword"]')
// atau
document.querySelectorAll('tbody tr')
```

---

## CHANGELOG

| Tanggal | Versi | Deskripsi |
|---------|-------|-----------|
| 2026-03-08 | 1.0.0 | Initial plan |

---

## CONTACT

Untuk pertanyaan atau issue, hubungi developer.
