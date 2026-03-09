# MCP SEO Server - Production Deployment

## Credential Login (Default)
- **Username**: `modalhp123`
- **Password**: `modal123!`

> ⚠️ **PENTING**: Ganti password default setelah deploy!

---

## Deployment dengan Docker (Recommended)

### Prerequisites
- Docker & Docker Compose terinstall
- Domain `seo.modalhp.com` pointing ke VPS

### Langkah Deploy

1. **Setup environment file**
```bash
cp .env.example .env
nano .env
```

Isi `.env` dengan:
```env
NODE_ENV=production
PORT=4000
SESSION_SECRET=<generate-random-string-min-32-chars>
API_KEY=<your-api-key>
```

2. **Generate SESSION_SECRET yang aman**
```bash
openssl rand -base64 32
```

3. **Build dan jalankan dengan Docker**
```bash
docker-compose up -d --build
```

4. **Setup Nginx Reverse Proxy**

Install Nginx:
```bash
sudo apt update && sudo apt install nginx -y
```

Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/seo.modalhp.com
```

Isi dengan:
```nginx
server {
    listen 80;
    server_name seo.modalhp.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/seo.modalhp.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

5. **Setup SSL dengan Let's Encrypt**
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d seo.modalhp.com
```

---

## Deployment Manual (tanpa Docker)

### Prerequisites
- Node.js 18+ terinstall
- PM2 terinstall global

### Langkah Deploy

1. **Install dependencies**
```bash
npm install --production
```

2. **Build TypeScript**
```bash
npm run build
```

3. **Setup environment**
```bash
cp .env.example .env
nano .env
```

4. **Jalankan dengan PM2**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## Mengganti Password Default

1. Login ke server
2. Hapus file users.json:
```bash
rm data/users.json
```
3. Restart server - file users.json akan dibuat ulang dengan default credentials
4. ATAU register user baru melalui UI: `https://seo.modalhp.com/login`

---

## URL Penting

- Login: `https://seo.modalhp.com/login`
- Dashboard: `https://seo.modalhp.com/dashboard`
- API Health: `https://seo.modalhp.com/api/health`

---

## Monitoring

Lihat logs:
```bash
# Docker
docker-compose logs -f

# PM2
pm2 logs mcp-seo-server
```

Restart server:
```bash
# Docker
docker-compose restart

# PM2
pm2 restart mcp-seo-server
```

Stop server:
```bash
# Docker
docker-compose down

# PM2
pm2 stop mcp-seo-server
```
