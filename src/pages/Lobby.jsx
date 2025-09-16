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

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('code', code).single();
      if (error || !data) { alert('Το δωμάτιο δεν βρέθηκε'); nav('/'); return; }
      setRoom(data);
      // Ensure we are in participants (deep link / refresh path)
      await supabase.from('participants').upsert({
        room_id: data.id, user_id: userId, name: name || 'Player', is_host: data.created_by === userId
      }, { onConflict: 'room_id,user_id' });
    })();
  }, [ready, code, userId, name, nav]);

  const isHost = useMemo(() => room && userId === room.created_by, [room, userId]);

  const { roster, broadcastStart } = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: isHost,
    onStart: ({ startedAt }) => {
      nav(`/play/${code}?t=${startedAt}`);
    }
  });

  const canStart = isHost && roster.filter(r => !!r.name).length >= 2;

  async function startGame() {
    const startedAt = Date.now();
    // Flip status to 'playing' (host-only policy permits)
    await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
    await broadcastStart({ startedAt });
    nav(`/play/${code}?t=${startedAt}`);
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}>
      <div className="max-w-2xl mx-auto text-slate-100">
        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-extrabold">Lobby</h1>
            <div className="pill bg-white/10">Κωδικός: <span className="font-mono">{code}</span></div>
          </div>

          <div className="mt-4 text-sm text-slate-300">
            Στείλε τον σύνδεσμο <span className="font-mono">/room/{code}</span> ή τον κωδικό στους φίλους σου.
          </div>

          <ul className="mt-4 divide-y divide-white/10">
            {roster.map(p => (
              <li key={p.user_id} className="py-2 flex items-center justify-between">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-slate-300">
                  {p.is_host ? 'Host' : 'Player'} {p.finished ? '• Ολοκλήρωσε' : ''}
                </div>
              </li>
            ))}
            {roster.length === 0 && <li className="py-3 text-slate-400">Κανείς δεν έχει μπει ακόμα…</li>}
          </ul>

          <div className="mt-6 flex items-center justify-between">
            <button className="btn btn-neutral" onClick={() => nav('/')}>← Πίσω</button>
            {isHost && (
              <button className="btn btn-accent disabled:opacity-50" onClick={startGame} disabled={!canStart}>
                Ξεκίνα το παιχνίδι
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
