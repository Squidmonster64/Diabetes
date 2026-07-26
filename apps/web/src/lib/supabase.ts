import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client using only the public anon key. Never import
 * a service-role key here - APP_BUILD_PROMPT.md section 11/18.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321",
  import.meta.env.VITE_SUPABASE_ANON_KEY || "public-anon-key-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Supabase's own storage already avoids putting the raw token in plain
      // query strings; we additionally never log it (see apiClient.ts).
    },
  },
);
