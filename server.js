const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");
const HARDCODED_CLERK_PUBLISHABLE_KEY = "pk_test_Y2FwaXRhbC1raXdpLTI3LmNsZXJrLmFjY291bnRzLmRldiQ";
const HARDCODED_CLERK_SECRET_KEY = "sk_test_bAhk8B8TBmqndvT8resKCJ1I15hUCctowgF3NgBaI6";

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
  ) || HARDCODED_CLERK_PUBLISHABLE_KEY;
  const clerkSecretKey = getEnv(
    "CLERK_SECRET_KEY"
  ) || HARDCODED_CLERK_SECRET_KEY;

  if (!clerkPublishableKey || !clerkSecretKey) {
    return res.status(503).json({
      success: false,
      message: "Clerk keys are not configured."
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
