const normalizeEnvValue = (value) => String(value || "").trim().replace(/^"(.*)"$/, "$1");

const getEnv = (...names) => {
  for (const name of names) {
    const value = normalizeEnvValue(process.env[name]);
    if (value) return value;
  }
  return "";
};

module.exports = (_req, res) => {
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

  return res.status(200).json({
    success: true,
    supabaseUrl,
    supabaseAnonKey
  });
};
