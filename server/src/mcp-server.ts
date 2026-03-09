#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data");
const API_KEY = process.env.API_KEY || "default-key";
const SERVER_URL = process.env.SERVER_URL || "https://seo.modalhp.com";

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Storage functions
function getKeywordHistory(): any[] {
  const indexPath = path.join(DATA_DIR, "index.json");

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

function getKeywordsByDate(date: string): any {
  const indexPath = path.join(DATA_DIR, "index.json");

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const entriesForDate = index.filter((entry: any) => entry.downloadDate === date);

  if (entriesForDate.length === 0) {
    return null;
  }

  // Load all keyword data for this date
  const allKeywords: any[] = [];
  for (const entry of entriesForDate) {
    const filePath = path.join(DATA_DIR, entry.file);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      allKeywords.push(...data.keywords);
    }
  }

  return {
    date,
    downloadCount: entriesForDate.length,
    totalKeywords: allKeywords.length,
    downloads: entriesForDate,
    keywords: allKeywords
  };
}

function getAllKeywords(): { history: any[]; totalKeywords: number; totalDownloads: number } {
  const indexPath = path.join(DATA_DIR, "index.json");

  if (!fs.existsSync(indexPath)) {
    return { history: [], totalKeywords: 0, totalDownloads: 0 };
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const totalKeywords = index.reduce((sum: number, entry: any) => sum + entry.keywordCount, 0);

  return {
    history: index,
    totalKeywords,
    totalDownloads: index.length
  };
}

function searchKeywords(query: string, limit: number = 100): any[] {
  const { history } = getAllKeywords();
  const results: any[] = [];
  const seenKeywords = new Set<string>();

  const queryLower = query.toLowerCase();

  for (const entry of history) {
    const filePath = path.join(DATA_DIR, entry.file);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const kw of data.keywords) {
      const keywordText = kw.keyword.toLowerCase();
      if (keywordText.includes(queryLower) && !seenKeywords.has(kw.keyword)) {
        seenKeywords.add(kw.keyword);
        results.push({
          ...kw,
          sourceDate: entry.downloadDate,
          sourceTimestamp: entry.extractedTimestamp,
          sourceFile: entry.originalFilename
        });

        if (results.length >= limit) {
          return results;
        }
      }
    }
  }

  return results;
}

function getHighVolumeKeywords(minVolume: number = 1000): any[] {
  const { history } = getAllKeywords();
  const results: any[] = [];

  for (const entry of history) {
    const filePath = path.join(DATA_DIR, entry.file);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const kw of data.keywords) {
      if (kw.monthlySearches && kw.monthlySearches >= minVolume) {
        results.push({
          ...kw,
          sourceDate: entry.downloadDate,
          sourceTimestamp: entry.extractedTimestamp,
          sourceFile: entry.originalFilename
        });
      }
    }
  }

  // Sort by volume descending
  results.sort((a, b) => (b.monthlySearches || 0) - (a.monthlySearches || 0));

  return results;
}

async function fetchFromAPI(endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error);
    return null;
  }
}

// Define tools
const tools: Tool[] = [
  {
    name: "get_keyword_history",
    description: "Get complete history of all keyword downloads with metadata (date, count, source)",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_keywords_by_date",
    description: "Get all keywords downloaded on a specific date",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (e.g., 2026-03-09)"
        }
      },
      required: ["date"]
    }
  },
  {
    name: "search_keywords",
    description: "Search keywords by text pattern across all downloaded data",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (case-insensitive)"
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 100)",
          default: 100
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_high_volume_keywords",
    description: "Get keywords with monthly search volume above a threshold",
    inputSchema: {
      type: "object",
      properties: {
        minVolume: {
          type: "number",
          description: "Minimum monthly search volume (default: 1000)",
          default: 1000
        }
      },
      required: []
    }
  },
  {
    name: "get_keyword_stats",
    description: "Get summary statistics about the keyword collection",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "fetch_remote_history",
    description: "Fetch keyword history from the remote MCP server API",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// Create server
const server = new Server(
  {
    name: "seo-keyword-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_keyword_history": {
        const history = getKeywordHistory();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                totalDownloads: history.length,
                totalKeywords: history.reduce((sum: number, e: any) => sum + e.keywordCount, 0),
                history
              }, null, 2)
            }
          ]
        };
      }

      case "get_keywords_by_date": {
        const date = args?.date as string;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error("Invalid date format. Use YYYY-MM-DD");
        }

        const result = getKeywordsByDate(date);
        if (!result) {
          throw new Error(`No keywords found for date ${date}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                ...result
              }, null, 2)
            }
          ]
        };
      }

      case "search_keywords": {
        const query = args?.query as string;
        const limit = (args?.limit as number) || 100;

        const results = searchKeywords(query, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                query,
                found: results.length,
                keywords: results
              }, null, 2)
            }
          ]
        };
      }

      case "get_high_volume_keywords": {
        const minVolume = (args?.minVolume as number) || 1000;
        const results = getHighVolumeKeywords(minVolume);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                minVolume,
                found: results.length,
                keywords: results
              }, null, 2)
            }
          ]
        };
      }

      case "get_keyword_stats": {
        const { history, totalKeywords, totalDownloads } = getAllKeywords();

        // Calculate stats
        const keywordsWithVolume = history.reduce((sum: number, e: any) => sum + (e.keywordsWithVolume || 0), 0);
        const dates = history.map((e: any) => e.downloadDate).filter(Boolean);
        const uniqueDates = [...new Set(dates)];
        const firstDownload = uniqueDates.sort()[0];
        const lastDownload = uniqueDates.sort().reverse()[0];

        const stats = {
          success: true,
          totalDownloads,
          totalKeywords,
          keywordsWithVolume,
          uniqueDownloadDates: uniqueDates.length,
          firstDownloadDate: firstDownload || "N/A",
          lastDownloadDate: lastDownload || "N/A",
          averageKeywordsPerDownload: totalDownloads > 0 ? Math.round(totalKeywords / totalDownloads) : 0
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }

      case "fetch_remote_history": {
        const result = await fetchFromAPI("/api/keywords/history");

        if (!result) {
          throw new Error("Failed to fetch from remote server");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP SEO Keyword Server running on stdio");
  console.error(`Data directory: ${DATA_DIR}`);
  console.error(`Server URL: ${SERVER_URL}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
