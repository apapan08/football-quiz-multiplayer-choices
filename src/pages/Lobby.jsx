// src/pages/Lobby.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';

export default function Lobby() {
  const { code } = useParams();
  const nav = useNavigate();
  const { ready, userId, name } = useSupabaseAuth();

  const [room, setRoom] = useState(null);
  const [copied, setCopied] = useState(false);

  // DB-backed roster (participants table) to make joins appear instantly
  const [dbRoster, setDbRoster] = useState([]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${(code || '').toUpperCase()}`
      : '';

  // Guard: if visitor has no display name yet, send them to the Join page
  useEffect(() => {
    if (ready && !((name || '').trim())) {
      nav(`/join/${code}`, { replace: true });
    }
  }, [ready, name, code, nav]);

  // Fetch room + ensure we are in participants
  useEffect(() => {
    if (!ready || !userId) return;

    (async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (error || !data) {
        alert('Το δωμάτιο δεν βρέθηκε');
        nav('/');
        return;
      }

      setRoom(data);

      // Upsert me as participant (RLS: user_id must equal auth.uid())
      const up = await supabase.from('participants').upsert(
        {
          room_id: data.id,
          user_id: userId,
          name: (name || 'Player').trim(),
          is_host: data.created_by === userId,
        },
        { onConflict: 'room_id,user_id' }
      );

      if (up.error) {
        console.error('participants upsert failed:', up.error);
      }
    })();
  }, [ready, code, userId, name, nav]);

  // Seed and live-update roster from DB (participants) for snappy joins
  useEffect(() => {
    if (!room?.id) return;

    let channel;

    (async () => {
      // initial snapshot
      const { data } = await supabase
        .from('participants')
        .select('user_id,name,is_host')
        .eq('room_id', room.id);
      setDbRoster(data || []);

      // realtime changes
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
              if (eventType === 'DELETE' && o?.user_id) {
                by.delete(o.user_id);
              }
              return Array.from(by.values());
            });
          }
        )
        .subscribe();
    })();

    return () => {
      try { channel?.unsubscribe(); } catch {}
    };
  }, [room?.id]);

  const isHost = useMemo(
    () => room && userId === room.created_by,
    [room, userId]
  );

  // Presence roster (with optimistic self inside the hook)
  const { roster, broadcastStart } = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: isHost,
    onStart: ({ startedAt }) => {
      nav(`/play/${code}?t=${startedAt}`);
    },
  });

  // Merge DB roster (fast) with presence roster (authoritative online status)
  const displayRoster = useMemo(() => {
    const by = new Map();
    // DB snapshot
    dbRoster.forEach(p => by.set(p.user_id, { ...p }));
    // presence metadata (finished flag etc.)
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
    <div
      className="min-h-screen p-6"
      style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}
    >
      <div className="max-w-2xl mx-auto text-slate-100">
        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-extrabold">Lobby</h1>
            <div className="pill bg-white/10">
              Κωδικός: <span className="font-mono">{(code || '').toUpperCase()}</span>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-300 space-y-2">
            <div>Στείλε αυτό το link στους φίλους σου:</div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl bg-slate-900/60 px-3 py-2 text-slate-200 outline-none ring-1 ring-white/10"
                readOnly
                value={shareUrl}
              />
              <button className="btn btn-neutral px-3" onClick={copyInvite}>
                {copied ? '✓ Αντιγράφηκε' : 'Αντιγραφή'}
              </button>
            </div>
            <div className="text-xs text-slate-400">
              Εναλλακτικά, δώσε τον κωδικό: <span className="font-mono">{(code || '').toUpperCase()}</span>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-white/10">
            {displayRoster.map((p) => (
              <li key={p.user_id} className="py-2 flex items-center justify-between">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-slate-300">
                  {p.is_host ? 'Host' : 'Player'} {p.finished ? '• Ολοκλήρωσε' : ''}
                </div>
              </li>
            ))}
            {displayRoster.length === 0 && (
              <li className="py-3 text-slate-400">Συνδέεσαι…</li>
            )}
          </ul>

          <div className="mt-6 flex items-center justify-between">
            <button className="btn btn-neutral" onClick={() => nav('/')}>
              ← Πίσω
            </button>
            {isHost && (
              <button
                className="btn btn-accent disabled:opacity-50"
                onClick={startGame}
                disabled={!canStart}
              >
                Ξεκίνα το παιχνίδι
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
