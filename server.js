const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

const normalizeEnvValue = (value) => String(value || "").trim().replace(/^"(.*)"$/, "$1");

const getEnv = (...names) => {
  for (const name of names) {
    const value = normalizeEnvValue(process.env[name]);
    if (value) return value;
  }
  return "";
};

app.get("/api/config", (_req, res) => {
  const supabaseUrl = getEnv(
    "VITE_SUPABASE_URL",
    "PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "hippovault_SUPABASE_URL"
  );
  const supabaseAnonKey = getEnv(
    "VITE_SUPABASE_ANON_KEY",
    "PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "hippovault_SUPABASE_ANON_KEY"
  );

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      success: false,
      message: "Supabase environment variables are not configured."
    });
  }

  return res.json({
    success: true,
    supabaseUrl,
    supabaseAnonKey
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hippovault is running.",
    runtime: "static+supabase"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hippovault is running.",
    runtime: "static+supabase"
  });
});

app.use(express.static(publicDir));

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
