# MCP SEO Server - Google Ads Keyword Extractor

Extract keyword data from Google Ads Keyword Planner and analyze it using MCP Server.

---

## Project Structure

```
MCP SEO/
├── server/                   # MCP Server (Express API)
│   ├── Dockerfile
│   ├── src/
│   │   └── index.ts          # Main server file
│   ├── package.json
│   └── tsconfig.json
│
├── extension/                # Chrome Extension
│   ├── src/
│   │   ├── manifest.json
│   │   ├── content.ts        # Keyword extraction script
│   │   ├── background.ts     # Service worker
│   │   └── popup/
│   │       ├── index.html
│   │       └── popup.ts
│   ├── package.json
│   └── tsconfig.json
│
└── docker/
    ├── docker-compose.yml    # Deployment configuration
    └── .env.example
```

---

## Quick Start

### 1. Deploy MCP Server to VPS

```bash
# Upload files to VPS
scp -r server/ root@72.62.127.3:/root/mcp-seo/server/
scp -r extension/ root@72.62.127.3:/root/mcp-seo/extension/
scp docker/ root@72.62.127.3:/root/mcp-seo/docker/

# SSH to VPS
ssh root@72.62.127.3

# Generate API Key
API_KEY=$(openssl rand -hex 32)
echo "API_KEY=$API_KEY" > /root/mcp-seo/.env

# Deploy with Docker Compose
cd /root/mcp-seo/docker
docker-compose up -d --build

# Check status
docker-compose ps
docker logs mcp-seo-server
```

### 2. Test API Endpoint

```bash
# Health check
curl https://seo.modalhp.com/api/health

# Test with API Key
curl -X POST https://seo.modalhp.com/api/keywords \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keywords":[{"keyword":"test keyword"}]}'
```

### 3. Install Chrome Extension

1. Build extension (if not already built):
   ```bash
   cd extension/
   npm install
   npm run build
   ```

2. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension/` folder

3. Configure Extension:
   - Click extension icon
   - Enter MCP Server URL: `https://seo.modalhp.com`
   - Enter API Key (from step 1)
   - Click "Save Configuration"

4. Use with Google Ads:
   - Navigate to Google Ads Keyword Planner
   - Click "Send to MCP Server" button
   - Verify data sent successfully

---

## API Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/health` | GET | No | Health check |
| `/api/keywords` | POST | Yes | Receive keyword data |
| `/api/analyze` | POST | Yes | Analyze keywords |

### Request Format - POST /api/keywords

```json
{
  "keywords": [
    {
      "keyword": "example keyword",
      "monthlySearches": 10000,
      "competition": "HIGH",
      "lowTopPageBid": 1.50,
      "highTopPageBid": 3.00
    }
  ],
  "source": "Google Ads Keyword Planner"
}
```

### Response Format

```json
{
  "success": true,
  "message": "Successfully received 1 keywords",
  "count": 1
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `API_KEY` | (required) | Authentication key |
| `NODE_ENV` | production | Environment mode |

---

## Security Notes

- **NEVER** commit `.env` files to git
- **ALWAYS** use environment variables for sensitive data
- API Key is required for all endpoints except `/api/health`
- HTTPS is enforced via Traefik

---

## Troubleshooting

### Container not starting
```bash
docker logs mcp-seo-server
docker inspect mcp-seo-server
```

### SSL certificate issues
```bash
docker logs traefik-traefik-1
ls -la /var/lib/docker/volumes/traefik-letsencrypt/
```

### Extension not connecting
1. Check server URL in extension settings
2. Verify API Key is correct
3. Test connection using "Test Server Connection" button
4. Check browser console for CORS errors

---

## License

MIT
