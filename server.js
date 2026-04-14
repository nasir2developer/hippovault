const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const publicDir = path.join(__dirname, "public");
const JSON_LIMIT = "200kb";
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;
const API_WINDOW_MS = 60 * 1000;
const API_MAX_REQUESTS = 240;
const STATIC_ASSET_PATTERN = /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i;
const authRateBucket = new Map();
const apiRateBucket = new Map();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const normalizeEnvValue = (value) => String(value || "").trim().replace(/^"(.*)"$/, "$1");

const getEnv = (...names) => {
  for (const name of names) {
    const value = normalizeEnvValue(process.env[name]);
    if (value) return value;
  }
  return "";
};

const getRequiredEnv = (names, message) => {
  const value = getEnv(...names);
  if (!value) {
    throw new Error(message);
  }
  return value;
};

const appUrl = getEnv("APP_URL", "PUBLIC_APP_URL", "hippovault_APP_URL");

const databaseUrl = getRequiredEnv(
  ["DATABASE_URL", "hippovault_POSTGRES_URL", "hippovault_POSTGRES_URL_NON_POOLING"],
  "DATABASE_URL or hippovault_POSTGRES_URL is required."
);
const sessionSecret = getRequiredEnv(
  ["SESSION_SECRET", "hippovault_SESSION_SECRET", "hippovault_SUPABASE_JWT_SECRET"],
  "SESSION_SECRET or hippovault_SESSION_SECRET is required."
);
const dataEncryptionKey = getRequiredEnv(
  ["DATA_ENCRYPTION_KEY", "hippovault_DATA_ENCRYPTION_KEY"],
  "DATA_ENCRYPTION_KEY or hippovault_DATA_ENCRYPTION_KEY is required (32-byte key in base64)."
);

const encryptionKey = Buffer.from(dataEncryptionKey, "base64");
if (encryptionKey.length !== 32) {
  throw new Error("DATA_ENCRYPTION_KEY must decode to 32 bytes.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined
});

const parseOrigins = () => {
  const configured = getEnv("CORS_ORIGIN", "hippovault_CORS_ORIGIN")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = ["http://localhost:3000"];

  if (process.env.VERCEL_URL) {
    defaults.push(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    defaults.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  return [...new Set([...configured, ...defaults])];
};

const allowedOrigins = parseOrigins();

const buildCsp = () => {
  const connectSources = ["'self'"];
  if (appUrl) {
    try {
      connectSources.push(new URL(appUrl).origin);
    } catch (_error) {
      // Ignore invalid APP_URL values and keep the CSP self-only.
    }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${[...new Set(connectSources)].join(" ")}`,
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
};

const setSecurityHeaders = (req, res, next) => {
  res.setHeader("Content-Security-Policy", buildCsp());
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  if (req.path.startsWith("/api/") || req.path === "/submit-review" || req.path === "/get-reviews" || req.path === "/health") {
    res.setHeader("Cache-Control", "no-store");
  } else if (STATIC_ASSET_PATTERN.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
};

const sweepRateBucket = (bucket, now, windowMs) => {
  for (const [key, entry] of bucket.entries()) {
    if (now - entry.startedAt >= windowMs) {
      bucket.delete(key);
    }
  }
};

const getClientIp = (req) => req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

const createRateLimiter = ({ bucket, windowMs, maxRequests, keyPrefix }) => (req, res, next) => {
  const now = Date.now();
  sweepRateBucket(bucket, now, windowMs);
  const key = `${keyPrefix}:${getClientIp(req)}`;
  const current = bucket.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    bucket.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ success: false, message: "Too many requests. Please try again shortly." });
  }
  current.count += 1;
  return next();
};

const authLimiter = createRateLimiter({
  bucket: authRateBucket,
  windowMs: AUTH_WINDOW_MS,
  maxRequests: AUTH_MAX_ATTEMPTS,
  keyPrefix: "auth"
});

const apiLimiter = createRateLimiter({
  bucket: apiRateBucket,
  windowMs: API_WINDOW_MS,
  maxRequests: API_MAX_REQUESTS,
  keyPrefix: "api"
});

const limitString = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
const normalizeEmail = (value) => limitString(value, 255).toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPassword = (value) => typeof value === "string" && value.length >= 8 && value.length <= 128;
const normalizeOptionalEmail = (value) => {
  const email = normalizeEmail(value);
  return email ? email : null;
};

const normalizeAppUrl = (value) => {
  const raw = limitString(value, 2048);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch (_error) {
    return "";
  }
};

const validateReviewRating = (value) => {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
};

const dedupeById = (items) => {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
};

const makeId = () => `id-${Date.now()}-${Math.floor(Math.random() * 100000)}-${crypto.randomBytes(4).toString("hex")}`;

const defaultListSeed = [
  { id: "default-grocery", name: "Grocery List", locked: true, isDefault: true },
  { id: "default-electric", name: "Electric List", locked: true, isDefault: true },
  { id: "default-vegetable", name: "Vegetable List", locked: true, isDefault: true }
];

const normalizeListItems = (items) => dedupeById(
  (Array.isArray(items) ? items : [])
    .slice(0, 100)
    .map((item) => ({
      id: limitString(item?.id || makeId(), 120),
      itemName: limitString(item?.itemName, 400)
    }))
    .filter((item) => item.itemName)
);

const normalizePersistedPayload = (body) => {
  const accounts = dedupeById(
    (Array.isArray(body?.accounts) ? body.accounts : [])
      .slice(0, 250)
      .map((account) => ({
        id: limitString(account?.id || makeId(), 120),
        appName: limitString(account?.appName, 180),
        appUrl: normalizeAppUrl(account?.appUrl),
        username: limitString(account?.username, 180),
        password: limitString(account?.password, 500),
        createdAt: account?.createdAt || new Date().toISOString()
      }))
      .filter((account) => account.appName && account.appUrl && account.username && account.password)
  );

  const diaryEntries = dedupeById(
    (Array.isArray(body?.diaryEntries) ? body.diaryEntries : [])
      .slice(0, 500)
      .map((entry) => ({
        id: limitString(entry?.id || makeId(), 120),
        title: limitString(entry?.title, 220),
        body: limitString(entry?.body, 8000),
        createdAt: entry?.createdAt || new Date().toISOString()
      }))
      .filter((entry) => entry.title && entry.body)
  );

  const defaultItemsById = new Map(
    (Array.isArray(body?.defaultLists) ? body.defaultLists : [])
      .map((list) => [String(list?.id || ""), list])
  );

  const defaultLists = defaultListSeed.map((seed) => {
    const incoming = defaultItemsById.get(seed.id);
    return {
      id: seed.id,
      name: seed.name,
      locked: true,
      isDefault: true,
      items: normalizeListItems(incoming?.items)
    };
  });

  const userLists = dedupeById(
    (Array.isArray(body?.userLists) ? body.userLists : [])
      .slice(0, 100)
      .map((list) => ({
        id: limitString(list?.id || makeId(), 120),
        name: limitString(list?.name, 220),
        locked: false,
        items: normalizeListItems(list?.items)
      }))
      .filter((list) => list.id && list.name && !list.id.startsWith("default-"))
  );

  return { accounts, diaryEntries, defaultLists, userLists };
};

const rotateSession = (req, user, res, callback) => {
  req.session.regenerate((sessionError) => {
    if (sessionError) {
      console.error("session regenerate error:", sessionError);
      return res.status(500).json({ success: false, message: "Failed to establish session." });
    }
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    return callback();
  });
};

app.use(setSecurityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json({ limit: JSON_LIMIT }));
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON body." });
  }
  return next(err);
});

app.use(session({
  name: "hippovault.sid",
  store: new pgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(apiLimiter);
app.use(express.static(publicDir));

const encryptText = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

const decryptText = (value) => {
  try {
    const [ivB64, tagB64, dataB64] = String(value).split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);
    const output = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return output.toString("utf8");
  } catch (error) {
    return "";
  }
};

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  return next();
};

const ensureDefaultLists = async (userId) => {
  const existing = await pool.query("SELECT id FROM lists WHERE user_id = $1 AND is_default = TRUE", [userId]);
  const existingIds = new Set(existing.rows.map((row) => row.id));
  for (const seed of defaultListSeed) {
    if (existingIds.has(seed.id)) continue;
    await pool.query(
      "INSERT INTO lists (id, user_id, name, locked, is_default) VALUES ($1, $2, $3, TRUE, TRUE)",
      [seed.id, userId, seed.name]
    );
  }
};

const loadUserData = async (userId) => {
  await ensureDefaultLists(userId);
  const [accountsRes, diaryRes, listsRes, itemsRes] = await Promise.all([
    pool.query("SELECT id, app_name, app_url, username, password_encrypted, created_at FROM user_accounts WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, title, body, created_at FROM diary_entries WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, name, locked, is_default, created_at FROM lists WHERE user_id = $1 ORDER BY created_at ASC", [userId]),
    pool.query("SELECT id, list_id, item_name FROM list_items WHERE user_id = $1 ORDER BY created_at ASC", [userId])
  ]);

  const itemsByList = new Map();
  for (const row of itemsRes.rows) {
    const collection = itemsByList.get(row.list_id) || [];
    collection.push({ id: row.id, itemName: row.item_name });
    itemsByList.set(row.list_id, collection);
  }

  const accounts = accountsRes.rows.map((row) => ({
    id: row.id,
    appName: row.app_name,
    appUrl: row.app_url,
    username: row.username,
    password: decryptText(row.password_encrypted),
    createdAt: row.created_at
  }));

  const diaryEntries = diaryRes.rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at
  }));

  const allLists = listsRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    locked: row.locked,
    items: itemsByList.get(row.id) || []
  }));

  return {
    accounts,
    diaryEntries,
    userLists: allLists.filter((list) => !list.id.startsWith("default-")),
    defaultLists: allLists.filter((list) => list.id.startsWith("default-"))
  };
};

const loadUserReviews = async (userId) => {
  const result = await pool.query(
    "SELECT id, name, email, rating, review_text, created_at FROM reviews WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows;
};

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const name = limitString(req.body?.name, 120);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be between 8 and 128 characters." });
    }

    const hash = await bcrypt.hash(password, 12);
    const insert = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hash]
    );
    const user = insert.rows[0];
    await ensureDefaultLists(user.id);
    return rotateSession(req, user, res, () => res.json({ success: true, user }));
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Email is already registered." });
    }
    console.error("signup error:", error);
    return res.status(500).json({ success: false, message: "Failed to create account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    await ensureDefaultLists(user.id);
    return rotateSession(req, user, res, () => res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    }));
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ success: false, message: "Failed to login." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("hippovault.sid");
    res.json({ success: true });
  });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Unauthorized." });
    const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.session.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized." });
    return res.json({ success: true, user });
  } catch (error) {
    console.error("me error:", error);
    return res.status(500).json({ success: false, message: "Failed to load session." });
  }
});

app.get("/api/data", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  try {
    const data = await loadUserData(userId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("get data error:", error);
    return res.status(500).json({ success: false, message: "Failed to load user data." });
  }
});

app.put("/api/data", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { accounts, diaryEntries, userLists, defaultLists } = normalizePersistedPayload(req.body);

  const allLists = [...defaultLists, ...userLists];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM list_items WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM lists WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM diary_entries WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM user_accounts WHERE user_id = $1", [userId]);

    for (const account of accounts) {
      const id = String(account.id || makeId());
      await client.query(
        "INSERT INTO user_accounts (id, user_id, app_name, app_url, username, password_encrypted) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          id,
          userId,
          String(account.appName || ""),
          String(account.appUrl || ""),
          String(account.username || ""),
          encryptText(String(account.password || ""))
        ]
      );
    }

    for (const entry of diaryEntries) {
      const id = String(entry.id || makeId());
      await client.query(
        "INSERT INTO diary_entries (id, user_id, title, body) VALUES ($1, $2, $3, $4)",
        [id, userId, String(entry.title || ""), String(entry.body || "")]
      );
    }

    for (const list of allLists) {
      const id = String(list.id || makeId());
      const isDefault = id.startsWith("default-");
      await client.query(
        "INSERT INTO lists (id, user_id, name, locked, is_default) VALUES ($1, $2, $3, $4, $5)",
        [id, userId, String(list.name || ""), Boolean(list.locked || isDefault), isDefault]
      );
      const items = Array.isArray(list.items) ? list.items : [];
      for (const item of items) {
        const itemId = String(item.id || makeId());
        await client.query(
          "INSERT INTO list_items (id, user_id, list_id, item_name) VALUES ($1, $2, $3, $4)",
          [itemId, userId, id, String(item.itemName || "")]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("save data error:", error);
    return res.status(500).json({ success: false, message: "Failed to save user data." });
  } finally {
    client.release();
  }
});

app.post("/submit-review", requireAuth, async (req, res) => {
  try {
    const name = limitString(req.body?.name, 120);
    const email = normalizeOptionalEmail(req.body?.email);
    const rating = validateReviewRating(req.body?.rating);
    const reviewText = limitString(req.body?.review_text, 4000);
    if (!name || !reviewText) {
      return res.status(400).json({ success: false, message: "Name and review text are required." });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Email format is invalid." });
    }
    if (!rating) {
      return res.status(400).json({ success: false, message: "Rating must be an integer between 1 and 5." });
    }
    const id = makeId();
    const result = await pool.query(
      "INSERT INTO reviews (id, user_id, name, email, rating, review_text) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, rating, review_text, created_at",
      [id, req.session.userId, name, email, rating, reviewText]
    );
    return res.json({ success: true, message: "Review submitted successfully.", review: result.rows[0] });
  } catch (error) {
    console.error("submit-review error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while saving review." });
  }
});

app.get("/get-reviews", requireAuth, async (req, res) => {
  try {
    const reviews = await loadUserReviews(req.session.userId);
    return res.json({ success: true, reviews });
  } catch (error) {
    console.error("get-reviews error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while loading reviews." });
  }
});

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Secure API is running." });
});

app.get("/api/export", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT id, name, email, created_at FROM users WHERE id = $1", [req.session.userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const [data, reviews] = await Promise.all([
      loadUserData(req.session.userId),
      loadUserReviews(req.session.userId)
    ]);

    return res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at
      },
      data,
      reviews
    });
  } catch (error) {
    console.error("export error:", error);
    return res.status(500).json({ success: false, message: "Failed to export data." });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
