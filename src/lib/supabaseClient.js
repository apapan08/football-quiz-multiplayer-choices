// Single, shared client for the whole app.
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // This helps catch env issues early in dev
  // (won't crash prod builds)
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

const client = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

// ✅ Export in three ways so ANY import style works
export const supabase = client;         // named
export default client;                   // default
export function getSupabase() {          // function (if you prefer calling)
  return client;
}
