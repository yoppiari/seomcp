import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";
import session from "express-session";
import bcrypt from "bcryptjs";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
  }
}

dotenv.config();

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || "default-key";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data");
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production";

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[Storage] Created data directory: ${DATA_DIR}`);
}

// Users file for credential storage
const USERS_FILE = path.join(DATA_DIR, "users.json");

// Initialize users file if not exists
function initUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      {
        id: "1",
        username: "modalhp123",
        password: bcrypt.hashSync("modal123!", 10), // Default password
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    console.log("[Auth] Created default users file with modalhp123/modal123!");
  }
}

initUsersFile();

// User management functions
function getUsers(): any[] {
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function findUserByUsername(username: string): any | null {
  const users = getUsers();
  return users.find(u => u.username === username) || null;
}

function createUser(username: string, password: string): { success: boolean; error?: string } {
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return { success: false, error: "Username already exists" };
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    password: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  return { success: true };
}

function validateUser(username: string, password: string): any | null {
  const user = findUserByUsername(username);
  if (!user) {
    return null;
  }

  const isValid = bcrypt.compareSync(password, user.password);
  if (!isValid) {
    return null;
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

const app = express();

// Middleware
app.use(cors({
  origin: [/\.modalhp\.com$/, /localhost(:\d+)?$/, /127\.0\.0\.1(:\d+)?$/],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for reverse proxy setup (needed for secure cookies behind proxy)
app.set('trust proxy', 1);

// Session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust reverse proxy for secure cookies
  cookie: {
    secure: true, // Always use secure cookies (HTTPS)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    path: '/'
  }
}));

// Log session creation for debugging
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(body: any) {
    if (req.path.startsWith('/api/auth/')) {
      console.log(`[Debug] ${req.method} ${req.path} - Session ID: ${req.sessionID}, User ID: ${req.session?.userId || 'none'}`);
    }
    return originalSend.call(this, body);
  };
  next();
});

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized - Please login first" });
  }
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60000;
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

// Storage functions for keywords
function saveKeywords(data: {
  keywords: any[];
  metadata: {
    source: string;
    filename: string;
    extractedTimestamp: string | null;
    downloadDate: string | null;
    receivedAt: string;
    uploadedBy?: string;
  };
}) {
  const date = data.metadata.downloadDate || new Date().toISOString().split('T')[0];
  const time = data.metadata.extractedTimestamp?.replace(/:/g, '-') || Date.now().toString();
  const safeFilename = `${date}_${time}.json`;
  const filePath = path.join(DATA_DIR, safeFilename);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Storage] Saved ${data.keywords.length} keywords to ${filePath}`);

  const indexPath = path.join(DATA_DIR, "index.json");
  let index: any[] = [];
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }

  const indexEntry = {
    file: safeFilename,
    source: data.metadata.source,
    originalFilename: data.metadata.filename,
    downloadDate: data.metadata.downloadDate,
    extractedTimestamp: data.metadata.extractedTimestamp,
    receivedAt: data.metadata.receivedAt,
    uploadedBy: data.metadata.uploadedBy || "anonymous",
    keywordCount: data.keywords.length,
    keywordsWithVolume: data.keywords.filter((kw: any) => kw.monthlySearches && kw.monthlySearches > 0).length
  };

  const existingIndex = index.findIndex(i => i.file === safeFilename);
  if (existingIndex >= 0) {
    index[existingIndex] = indexEntry;
  } else {
    index.push(indexEntry);
  }

  index.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`[Storage] Updated index with ${index.length} entries`);

  return safeFilename;
}

function getKeywordHistory(): any[] {
  const indexPath = path.join(DATA_DIR, "index.json");

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

// Parse CSV content
function parseCSV(csvText: string): any[] {
  const keywords: any[] = [];

  // Remove UTF-16 BOM if present and convert to UTF-8
  if (csvText.charCodeAt(0) === 0xFEFF) {
    csvText = csvText.slice(1);
  }

  // Handle UTF-16 encoded content (Google Ads exports)
  // UTF-16 files have null bytes between ASCII characters
  if (csvText.includes('\0')) {
    // Convert UTF-16 LE to UTF-8 by removing null bytes between characters
    csvText = csvText.replace(/\0/g, '');
  }

  const lines = csvText.split(/\r?\n/);

  if (lines.length < 2) {
    return keywords;
  }

  // Find the header line (line with "Keyword" column)
  // Google Ads files may have metadata rows at the beginning
  let headerLineIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('keyword') && (line.includes('search') || line.includes('competition'))) {
      headerLineIndex = i;
      break;
    }
  }

  const header = parseCSVLine(lines[headerLineIndex]);

  // Log header for debugging
  console.log('[CSV] Header columns:', header.map(h => h.trim()).join(' | '));

  const keywordIndex = header.findIndex(h =>
    h.toLowerCase().includes('keyword') || h.toLowerCase().includes('kata kunci')
  );

  // Search for "Ave. monthly searches" or similar column names
  const searchVolumeIndex = header.findIndex(h => {
    const lower = h.toLowerCase();
    return lower.includes('monthly') ||
           lower.includes('search') ||
           lower.includes('penelusuran') ||
           lower.includes('avg.') ||
           lower.includes('ave.');
  });

  const competitionIndex = header.findIndex(h =>
    h.toLowerCase().includes('competition') || h.toLowerCase().includes('persaingan')
  );
  const minBidIndex = header.findIndex(h =>
    h.toLowerCase().includes('min') || h.toLowerCase().includes('low')
  );
  const maxBidIndex = header.findIndex(h =>
    h.toLowerCase().includes('max') || h.toLowerCase().includes('high')
  );

  console.log(`[CSV] Column indices - Keyword: ${keywordIndex}, SearchVolume: ${searchVolumeIndex}, Competition: ${competitionIndex}`);

  // Start from line after header
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line);
    if (cells.length < 1 || !cells[0]) continue;

    // Skip metadata rows (rows that don't have keyword as first meaningful column)
    const keywordValue = cells[keywordIndex] || cells[0];
    if (!keywordValue || keywordValue.trim() === '') continue;

    const keywordData: any = {
      keyword: keywordValue.trim()
    };

    // Parse search volume if column found
    if (searchVolumeIndex > -1 && cells[searchVolumeIndex]) {
      const volume = parseSearchVolume(cells[searchVolumeIndex]);
      keywordData.monthlySearches = volume;
      console.log(`[CSV] Keyword: ${keywordData.keyword}, Volume: ${volume} (raw: "${cells[searchVolumeIndex]}")`);
    }

    if (competitionIndex > -1 && cells[competitionIndex]) {
      keywordData.competition = cells[competitionIndex];
      keywordData.competitionIndex = getCompetitionIndex(cells[competitionIndex]);
    }

    if (minBidIndex > -1 && cells[minBidIndex]) {
      keywordData.lowTopPageBid = parseBid(cells[minBidIndex]);
    }

    if (maxBidIndex > -1 && cells[maxBidIndex]) {
      keywordData.highTopPageBid = parseBid(cells[maxBidIndex]);
    }

    if (keywordData.keyword) {
      keywords.push(keywordData);
    }
  }

  console.log(`[CSV] Parsed ${keywords.length} keywords, ${keywords.filter(k => k.monthlySearches && k.monthlySearches > 0).length} with volume`);
  return keywords;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

function parseSearchVolume(text: string): number {
  if (!text || text === '—' || text === '-') return 0;
  const clean = text.replace(/,/g, '').replace(/\./g, '');
  const match = clean.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseBid(text: string): number {
  if (!text || text === '—' || text === '-') return 0;
  const clean = text.replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

function getCompetitionIndex(competition: string): number {
  const lower = competition.toLowerCase();
  if (lower.includes('rendah') || lower.includes('low')) return 30;
  if (lower.includes('sedang') || lower.includes('medium')) return 60;
  if (lower.includes('tinggi') || lower.includes('high')) return 90;
  return 50;
}

// ============ AUTH ROUTES ============

app.post("/api/auth/login", (req: express.Request, res: express.Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = validateUser(username, password);

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Create session
    if (req.session) {
      req.session.userId = user.id;
      req.session.username = user.username;
    }

    console.log(`[Auth] User ${user.username} logged in`);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/logout", (req: express.Request, res: express.Response) => {
  if (req.session) {
    const username = req.session.username;
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
    });
    console.log(`[Auth] User ${username} logged out`);
  }
  res.json({ success: true });
});

app.get("/api/auth/me", (req: express.Request, res: express.Response) => {
  if (req.session && req.session.userId) {
    res.json({
      success: true,
      user: {
        id: req.session.userId,
        username: req.session.username
      }
    });
  } else {
    res.status(401).json({ success: false, error: "Not logged in" });
  }
});

app.post("/api/auth/register", (req: express.Request, res: express.Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const result = createUser(username, password);

    if (result.success) {
      res.json({ success: true, message: "User created successfully" });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ KEYWORD ROUTES ============

app.get("/api/health", (req: express.Request, res: express.Response) => {
  res.json({
    status: "healthy",
    service: "mcp-seo-server",
    timestamp: new Date().toISOString()
  });
});

// CSV File Upload endpoint
app.post("/api/keywords/upload", requireAuth, upload.single('csv'), (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No CSV file uploaded" });
    }

    const filename = req.file.originalname;
    // Detect encoding: UTF-16 LE (Google Ads) or UTF-8
    const buffer = req.file.buffer;
    let csvContent: string;

    // Check for UTF-16 LE BOM (FF FE) or UTF-16 BE BOM (FE FF)
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      // UTF-16 LE
      csvContent = buffer.toString('utf16le');
      console.log('[Upload] Detected UTF-16 LE encoding');
    } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      // UTF-16 BE - need to swap bytes
      csvContent = buffer.swap16().toString('utf16le');
      console.log('[Upload] Detected UTF-16 BE encoding');
    } else {
      // Default to UTF-8
      csvContent = buffer.toString('utf-8');
      console.log('[Upload] Detected UTF-8 encoding');
    }

    const keywords = parseCSV(csvContent);

    if (keywords.length === 0) {
      return res.status(400).json({ error: "No keywords found in CSV" });
    }

    const processedData = {
      keywords,
      metadata: {
        source: 'CSV File Upload',
        filename,
        extractedTimestamp: null,
        downloadDate: new Date().toISOString().split('T')[0],
        receivedAt: new Date().toISOString(),
        uploadedBy: req.session?.username || "unknown"
      }
    };

    const savedFilename = saveKeywords(processedData);

    console.log(`\n========== CSV FILE UPLOADED ==========`);
    console.log(`Filename: ${filename}`);
    console.log(`Total Keywords: ${keywords.length}`);
    console.log(`Uploaded by: ${req.session?.username}`);
    console.log(`Stored in: ${savedFilename}`);
    console.log(`======================================\n`);

    res.json({
      success: true,
      message: `Successfully uploaded ${keywords.length} keywords from CSV`,
      count: keywords.length,
      withVolume: keywords.filter((kw: any) => kw.monthlySearches && kw.monthlySearches > 0).length,
      filename,
      storedFilename: savedFilename
    });
  } catch (error) {
    console.error("Error uploading CSV file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// JSON Keywords endpoint
app.post("/api/keywords", requireAuth, (req: express.Request, res: express.Response) => {
  try {
    const { keywords, source, filename, timestamp: clientTimestamp } = req.body;

    if (!Array.isArray(keywords)) {
      return res.status(400).json({ error: "Invalid request: keywords must be an array" });
    }

    for (const kw of keywords) {
      if (!kw.keyword || typeof kw.keyword !== "string") {
        return res.status(400).json({ error: "Invalid keyword format" });
      }
    }

    let extractedTimestamp = null;
    let downloadDate = null;

    if (filename && typeof filename === 'string') {
      const filenameMatch = filename.match(/(\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})_(\d{2})_(\d{2})/);
      if (filenameMatch) {
        const [, date, hours, minutes, seconds] = filenameMatch;
        extractedTimestamp = `${date}T${hours.padStart(2, '0')}:${minutes}:${seconds}`;
        downloadDate = date;
      }
    }

    const processedData = {
      keywords: keywords.map((kw: any) => ({
        ...kw,
        downloadedAt: extractedTimestamp || clientTimestamp || new Date().toISOString(),
        downloadDate: downloadDate
      })),
      metadata: {
        source: source || "unknown",
        filename: filename || "unknown",
        extractedTimestamp,
        downloadDate,
        receivedAt: new Date().toISOString(),
        uploadedBy: req.session?.username || "unknown"
      }
    };

    const savedFilename = saveKeywords(processedData);

    console.log(`\n========== KEYWORDS RECEIVED ==========`);
    console.log(`Source: ${source || "unknown"}`);
    console.log(`Filename: ${filename || "unknown"}`);
    console.log(`Uploaded by: ${req.session?.username}`);
    console.log(`Total Keywords: ${keywords.length}`);
    console.log(`======================================\n`);

    const withVolume = keywords.filter((kw: any) => kw.monthlySearches && kw.monthlySearches > 0);

    res.json({
      success: true,
      message: `Successfully received ${keywords.length} keywords`,
      count: keywords.length,
      withVolume: withVolume.length,
      filename,
      storedFilename: savedFilename
    });
  } catch (error) {
    console.error("Error processing keywords:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get keyword history
app.get("/api/keywords/history", requireAuth, (req: express.Request, res: express.Response) => {
  try {
    const history = getKeywordHistory();
    res.json({
      success: true,
      history,
      totalDownloads: history.length,
      totalKeywords: history.reduce((sum: number, entry: any) => sum + entry.keywordCount, 0)
    });
  } catch (error) {
    console.error("Error getting history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ STATIC FILES (Web UI) ============

// Serve static files from public directory
const publicDir = path.join(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Serve login page
app.get("/login", (req: express.Request, res: express.Response) => {
  if (req.session && req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(publicDir, "login.html"));
});

// Serve dashboard
app.get("/dashboard", requireAuth, (req: express.Request, res: express.Response) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// Redirect root to dashboard or login
app.get("/", (req: express.Request, res: express.Response) => {
  if (req.session && req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.redirect("/login");
});

// Start server
app.listen(parseInt(PORT.toString()), () => {
  console.log(`\n========================================`);
  console.log(`MCP SEO Server running on port ${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}`);
  console.log(`Login: http://localhost:${PORT}/login`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`\nDefault credentials:`);
  console.log(`  Username: modalhp123`);
  console.log(`  Password: modal123!`);
  console.log(`========================================\n`);
});
