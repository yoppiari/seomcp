# MCP SEO Server - Configuration for Claude Code

## Setup MCP Server di Claude Code

### Opsi 1: Setup Global (Recommended)

Edit file `~/.config/Code/User/globalStorage/anthropic.claude-code/mcp.json` atau jalankan perintah ini:

```bash
mkdir -p ~/.config/Code/User/globalStorage/anthropic.claude-code

cat > ~/.config/Code/User/globalStorage/anthropic.claude-code/mcp.json << 'EOF'
{
  "mcpServers": {
    "seo-keywords": {
      "command": "node",
      "args": ["/home/yopi/Projects/MCP SEO/server/dist/mcp-server.js"],
      "cwd": "/home/yopi/Projects/MCP SEO/server",
      "env": {
        "DATA_DIR": "/home/yopi/Projects/MCP SEO/server/data",
        "SERVER_URL": "https://seo.modalhp.com",
        "API_KEY": "2f3bd395c3a85ec7e2b704b57f07dfac0a6d624c13c536479ca5809db202bcd0"
      }
    }
  }
}
EOF
```

### Opsi 2: Setup Local (Project-specific)

Buat file `.claude/mcp.json` di root project:

```bash
mkdir -p .claude

cat > .claude/mcp.json << 'EOF'
{
  "mcpServers": {
    "seo-keywords": {
      "command": "node",
      "args": ["/home/yopi/Projects/MCP SEO/server/dist/mcp-server.js"],
      "cwd": "/home/yopi/Projects/MCP SEO/server",
      "env": {
        "DATA_DIR": "/home/yopi/Projects/MCP SEO/server/data",
        "SERVER_URL": "https://seo.modalhp.com",
        "API_KEY": "2f3bd395c3a85ec7e2b704b57f07dfac0a6d624c13c536479ca5809db202bcd0"
      }
    }
  }
}
EOF
```

## Tools yang Tersedia

Setelah setup, Claude Code akan memiliki akses ke tools berikut:

### 1. `get_keyword_history`
Ambil semua history download keywords dengan metadata.

```
/analyze Get all keyword download history
```

### 2. `get_keywords_by_date`
Ambil keywords yang didownload pada tanggal tertentu.

```
/analyze Get keywords from 2026-03-09
```

### 3. `search_keywords`
Cari keywords berdasarkan pola text.

```
/analyze Search keywords for "aplikasi"
```

### 4. `get_high_volume_keywords`
Ambil keywords dengan search volume tinggi.

```
/analyze Get keywords with volume above 1000
```

### 5. `get_keyword_stats`
Dapatkan statistik koleksi keywords.

```
/analyze Get keyword collection statistics
```

### 6. `fetch_remote_history`
Ambil data dari remote server API.

```
/analyze Fetch remote keyword history
```

## Testing

Setelah setup, test dengan perintah:

```bash
claude
> /analyze Show available MCP tools
> /analyze Get keyword stats
> /analyze Search for keywords about "aplikasi"
```

## Restart MCP Server

Jika ada perubahan, restart Claude Code atau reload window:
- `Ctrl+Shift+P` → "Developer: Reload Window"
