// src/hooks/useSupabaseAuth.js
import { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabaseClient';

const NAME_KEY = 'display_name_v1';

export function useSupabaseAuth() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [name, _setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  });

  const setName = useCallback((n) => {
    const v = (n ?? '').toString().trim().slice(0, 24);
    try { localStorage.setItem(NAME_KEY, v); } catch {}
    _setName(v);
  }, []);

  useEffect(() => {
    let unsub;
    (async () => {
      // 1) Ensure we have a session (anonymous ok)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Requires "Authentication → Providers → Anonymous" to be enabled in Supabase Dashboard
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Anonymous sign-in failed:', error);
          setReady(true);
          return;
        }
      }

      // 2) Track session changes → set userId + ready
      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        setUserId(sess?.user?.id ?? null);
        setReady(true);
      });
      unsub = sub?.subscription;
    })();

    return () => unsub?.unsubscribe();
  }, []);

  return { ready, userId, name, setName };
}
