// Single, shared client for the whole app.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// CRITICAL: Fail fast if environment variables are missing
if (!url || !key) {
  const errorMsg = '[CRITICAL] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Please check your .env file.';
  console.error(errorMsg);
  
  // In development, throw an error to make it obvious
  if (import.meta.env.DEV) {
    throw new Error(errorMsg);
  }
  
  // In production, create a dummy client that will fail gracefully
  // This prevents the app from completely crashing
  console.warn('[supabase] Creating fallback client - API calls will fail');
}

const client = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

// Log successful initialization in development
if (import.meta.env.DEV && url && key) {
  console.log('[supabase] Client initialized successfully');
}

// ✅ Export in three ways so ANY import style works
export const supabase = client;         // named
export default client;                   // default
export function getSupabase() {          // function (if you prefer calling)
  return client;
}