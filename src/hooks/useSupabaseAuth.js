// src/hooks/useSupabaseAuth.js
import { useEffect, useState, useCallback } from 'react';
import  supabase from '../lib/supabaseClient';

const NAME_KEY = 'display_name_v1';

export function useSupabaseAuth() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [name, _setName] = useState(() => localStorage.getItem(NAME_KEY) || '');

  const setName = useCallback((n) => {
    const v = (n ?? '').toString().trim().slice(0, 24);
    localStorage.setItem(NAME_KEY, v);
    _setName(v);
  }, []);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      const client = supabase;
      const { data } = await client.auth.getSession();
      if (!data?.session) {
        await client.auth.signInAnonymously();
      }
      const { data: s2 } = await client.auth.getSession();
      if (mounted) {
        setUserId(s2?.session?.user?.id ?? null);
        setReady(true);
      }
    };
    boot();
    return () => { mounted = false; };
  }, []);

  return { ready, userId, name, setName };
}
