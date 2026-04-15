import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const configApi = window.location.protocol === "file:" ? null : "/api/config";
let supabaseClientPromise = null;

const loadSupabaseConfig = async () => {
  if (!configApi) {
    throw new Error("Supabase config is unavailable in file mode.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  const response = await fetch(configApi, { signal: controller.signal })
    .finally(() => window.clearTimeout(timeoutId));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.supabaseUrl || !payload?.supabaseAnonKey) {
    throw new Error(payload?.message || "Supabase config is missing.");
  }

  return payload;
};

export const getSupabaseClient = async () => {
  if (!supabaseClientPromise) {
    supabaseClientPromise = loadSupabaseConfig()
      .then(({ supabaseUrl, supabaseAnonKey }) => createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }));
  }

  return supabaseClientPromise;
};
