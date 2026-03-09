import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || "default-key";

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow chrome-extension:// origins and all for testing
    if (!origin || origin.startsWith("chrome-extension://") || origin.startsWith("http")) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, can be restricted later
    }
  },
  credentials: true
}));
app.use(express.json());

// Rate limiting simple
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;

  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(ip, record);
  } else {
    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({ error: "Too many requests" });
    }
  }
  next();
}

app.use(rateLimit);

// Middleware to verify API key
function verifyApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized - Invalid API key" });
  }
  next();
}

// Health check endpoint (no auth required)
app.get("/api/health", (req: express.Request, res: express.Response) => {
  res.json({
    status: "healthy",
    service: "mcp-seo-server",
    timestamp: new Date().toISOString()
  });
});

// Keywords endpoint - receive data from Chrome Extension
app.post("/api/keywords", verifyApiKey, (req: express.Request, res: express.Response) => {
  try {
    const { keywords, source } = req.body;

    if (!Array.isArray(keywords)) {
      return res.status(400).json({ error: "Invalid request: keywords must be an array" });
    }

    // Validate keyword objects
    for (const kw of keywords) {
      if (!kw.keyword || typeof kw.keyword !== "string") {
        return res.status(400).json({ error: "Invalid keyword format: each keyword must have a 'keyword' string field" });
      }
    }

    // In production, store in database
    // For now, just log and return success
    console.log(`Received ${keywords.length} keywords from ${source || "unknown source"}`);

    res.json({
      success: true,
      message: `Successfully received ${keywords.length} keywords`,
      count: keywords.length
    });
  } catch (error) {
    console.error("Error processing keywords:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Analysis endpoint
app.post("/api/analyze", verifyApiKey, (req: express.Request, res: express.Response) => {
  try {
    const { keywords } = req.body;

    if (!Array.isArray(keywords)) {
      return res.status(400).json({ error: "Invalid request: keywords must be an array" });
    }

    // Simple analysis logic
    const analysis = keywords.map((kw: any) => {
      let volumeScore = kw.monthlySearches ? Math.min(100, Math.floor(kw.monthlySearches / 100)) : 50;
      let competitionScore = kw.competitionIndex ? 100 - kw.competitionIndex : 50;
      let overallScore = Math.round((volumeScore + competitionScore) / 2);

      return {
        keyword: kw.keyword,
        overallScore,
        recommendation: overallScore >= 70 ? "High priority" : overallScore >= 50 ? "Medium priority" : "Low priority"
      };
    });

    analysis.sort((a: any, b: any) => b.overallScore - a.overallScore);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error("Error analyzing keywords:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(parseInt(PORT.toString()), () => {
  console.log(`MCP SEO Server running on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`API Key configured: ${API_KEY !== "default-key" ? "Yes" : "No - Please set API_KEY in .env"}`);
});
