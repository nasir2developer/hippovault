import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const configApi = window.location.protocol === "file:" ? null : "/api/config";

const loadSupabaseConfig = async () => {
  if (!configApi) {
    throw new Error("Supabase config is unavailable in file mode.");
  }

  const response = await fetch(configApi);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.supabaseUrl || !payload?.supabaseAnonKey) {
    throw new Error(payload?.message || "Supabase config is missing.");
  }

  return payload;
};

const { supabaseUrl, supabaseAnonKey } = await loadSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
