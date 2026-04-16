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
  const clerkPublishableKey = getEnv(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "PUBLIC_CLERK_PUBLISHABLE_KEY"
  );

  if (!clerkPublishableKey) {
    return res.status(503).json({
      success: false,
      message: "Clerk environment variables are not configured."
    });
  }

  res.set("Cache-Control", "public, max-age=3600");

  return res.json({
    success: true,
    clerkPublishableKey
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hippovault is running.",
    runtime: "static+clerk"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hippovault is running.",
    runtime: "static+clerk"
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
