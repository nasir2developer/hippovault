import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const configApi = window.location.protocol === "file:" ? null : "/api/config";
const configCacheKey = "hippovault-supabase-config";
let supabaseClientPromise = null;

const readCachedConfig = () => {
  try {
    const cached = sessionStorage.getItem(configCacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed?.supabaseUrl || !parsed?.supabaseAnonKey) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
};

const writeCachedConfig = (payload) => {
  try {
    sessionStorage.setItem(configCacheKey, JSON.stringify({
      supabaseUrl: payload.supabaseUrl,
      supabaseAnonKey: payload.supabaseAnonKey
    }));
  } catch (_error) {
    // Ignore storage failures; runtime fetch still works.
  }
};

const loadSupabaseConfig = async () => {
  if (!configApi) {
    throw new Error("Supabase config is unavailable in file mode.");
  }

  const cachedConfig = readCachedConfig();
  if (cachedConfig) {
    return cachedConfig;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);
  const response = await fetch(configApi, { signal: controller.signal })
    .finally(() => window.clearTimeout(timeoutId));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.supabaseUrl || !payload?.supabaseAnonKey) {
    throw new Error(payload?.message || "Supabase config is missing.");
  }

  writeCachedConfig(payload);
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
      }))
      .catch((error) => {
        supabaseClientPromise = null;
        throw error;
      });
  }

  return supabaseClientPromise;
};
