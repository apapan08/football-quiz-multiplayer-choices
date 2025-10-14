// src/pages/Lobby.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';
import { Logo } from "../App.jsx";
import { QUIZ_ID } from '../lib/quizVersion';

export default function Lobby() {
  const { code } = useParams();
  const nav = useNavigate();
  const { ready, userId, name } = useSupabaseAuth();

  const [room, setRoom] = useState(null);
  const [copied, setCopied] = useState(false);

  const [dbRoster, setDbRoster] = useState([]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${(code || '').toUpperCase()}`
      : '';

  useEffect(() => {
    if (ready && !((name || '').trim())) {
      nav(`/join/${code}`, { replace: true });
    }
  }, [ready, name, code, nav]);

  // Fetch room (prefer current quiz), ensure I'm a participant
  useEffect(() => {
    if (!ready || !userId) return;

    (async () => {
      let q = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .eq('quiz_id', QUIZ_ID)
        .maybeSingle();

      let data = q.data;
      if (!data) {
        const fb = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
        data = fb.data;
      }
      if (!data) {
        alert('Το δωμάτιο δεν βρέθηκε');
        nav('/');
        return;
      }

      setRoom(data);

      const up = await supabase.from('participants').upsert(
        {
          room_id: data.id,
          user_id: userId,
          name: (name || 'Παίκτης').trim(),
          is_host: data.created_by === userId,
        },
        { onConflict: 'room_id,user_id' }
      );
      if (up.error) console.error('participants upsert failed:', up.error);
    })();
  }, [ready, code, userId, name, nav]);

  // Seed + realtime roster from participants
  useEffect(() => {
    if (!room?.id) return;
    let channel;

    (async () => {
      const { data } = await supabase
        .from('participants')
        .select('user_id,name,is_host')
        .eq('room_id', room.id);
      setDbRoster(data || []);

      channel = supabase
        .channel(`participants:${room.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
          ({ eventType, new: n, old: o }) => {
            setDbRoster(prev => {
              const by = new Map(prev.map(p => [p.user_id, p]));
              if (eventType === 'INSERT' || eventType === 'UPDATE') {
                by.set(n.user_id, { user_id: n.user_id, name: n.name, is_host: n.is_host });
              }
              if (eventType === 'DELETE' && o?.user_id) by.delete(o.user_id);
              return Array.from(by.values());
            });
          }
        )
        .subscribe();
    })();

    return () => { try { channel?.unsubscribe(); } catch {} };
  }, [room?.id]);

  const isHost = useMemo(() => room && userId === room.created_by, [room, userId]);

  const { roster, broadcastStart } = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Παίκτης',
    is_host: isHost,
    onStart: ({ startedAt }) => { nav(`/play/${code}?t=${startedAt}`); },
  });

  const displayRoster = useMemo(() => {
    const by = new Map();
    dbRoster.forEach(p => by.set(p.user_id, { ...p }));
    roster.forEach(p => by.set(p.user_id, { ...by.get(p.user_id), ...p }));
    return Array.from(by.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [dbRoster, roster]);

  const canStart = isHost && displayRoster.filter((r) => !!r.name).length >= 2;

  async function startGame() {
    if (!room) return;
    const startedAt = Date.now();
    await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
    await broadcastStart({ startedAt });
    nav(`/play/${code}?t=${startedAt}`);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-text">
      <div className="w-full max-w-2xl mx-auto">
        <Logo className="mx-auto h-32 w-auto mb-8" />

        <div className="card bg-surface-color p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-3xl font-extrabold text-white">Lobby</h1>
            <div className="pill bg-primary-color text-white">Κωδικός: <span className="font-mono">{(code || '').toUpperCase()}</span></div>
          </div>

          <div className="text-sm space-y-2 text-text-color-secondary">
            <p className="text-white">Μοιραστείτε αυτόν τον σύνδεσμο με τους φίλους σας για να συμμετάσχουν:</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="flex-1 min-w-0 rounded-lg px-4 py-2.5 outline-none bg-secondary-color text-text-color border border-border-color" readOnly value={shareUrl} />
              <button className="btn btn-accent text-white w-full sm:w-auto shrink-0" onClick={copyInvite} style={{ backgroundColor: 'var(--accent-color)' }}>
                {copied ? '✓ Αντιγράφηκε' : 'Αντιγραφή'}
              </button>
            </div>
            <p className="text-xs text-white">Εναλλακτικά, μπορούν να εισάγουν τον κωδικό: <span className="font-mono">{(code || '').toUpperCase()}</span></p>
            <p className="text-xs mt-1 text-white">
              {isHost
                ? (displayRoster.length < 2 ? 'Περιμένετε τουλάχιστον 2 παίκτες για να ξεκινήσετε.' : 'Όταν είστε έτοιμοι, πατήστε "Έναрξη παιχνιδιού".')
                : 'Περιμένετε τον διοργανωτή να ξεκινήσει το παιχνίδi.'}
            </p>
          </div>

          <ul className="mt-6 divide-y divide-border-color">
            {displayRoster.map((p) => (
              <li key={p.user_id} className="py-3 flex items-center justify-between">
                <div className="font-semibold text-lg text-white">{p.name}</div>
                <div className="text-xs text-white">
                  {p.is_host ? 'Διοργανωτής' : 'Παίκτης'} {p.finished ? '• Τελείωσε' : ''}
                </div>
              </li>
            ))}
            {displayRoster.length === 0 && <li className="py-4 text-text-color-secondary">Κανείς δεν είναι εδώ ακόμα...</li>}
          </ul>

          <div className="mt-6 flex justify-between">
            <a className="btn btn-neutral" href="/">← Αρχική</a>
            <button className="btn btn-accent disabled:opacity-60" disabled={!canStart} onClick={startGame} style={{ backgroundColor: 'var(--primary-color)' }}>Έναρξη παιχνιδιού</button>
          </div>
        </div>
      </div>
    </div>
  );
}
