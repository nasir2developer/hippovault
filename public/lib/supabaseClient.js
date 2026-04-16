import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCookieStorage, readCookieJson, writeCookieJson } from "./browserCookies.js";

const configApi = window.location.protocol === "file:" ? null : "/api/config";
const configCacheKey = "hippovault-supabase-config";
let supabaseClientPromise = null;
const authStorage = createCookieStorage("hippovault-supabase-auth");

const readCachedConfig = () => {
  const parsed = readCookieJson(configCacheKey);
  if (!parsed?.supabaseUrl || !parsed?.supabaseAnonKey) return null;
  return parsed;
};

const writeCachedConfig = (payload) => {
  writeCookieJson(configCacheKey, {
    supabaseUrl: payload.supabaseUrl,
    supabaseAnonKey: payload.supabaseAnonKey
  });
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
          storageKey: "hippovault-supabase-auth",
          storage: authStorage,
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
