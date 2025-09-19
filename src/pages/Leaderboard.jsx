// src/pages/Leaderboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import  useRoomChannel  from '../hooks/useRoomChannel';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { QUIZ_ID } from '../lib/quizVersion';

function sortRows(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return (a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9);
}

export default function Leaderboard() {
  const { code } = useParams();
  const nav = useNavigate();
  const { ready, userId, name } = useSupabaseAuth();
  const [room, setRoom] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      // Prefer current version, but allow legacy
      let q = await supabase.from('rooms').select('*').eq('code', code).eq('quiz_id', QUIZ_ID).maybeSingle();
      let r = q.data;
      if (!r) {
        const fb = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
        r = fb.data;
      }
      if (!r) { alert('Δωμάτιο δεν βρέθηκε'); nav('/'); return; }
      setRoom(r);

      const { data } = await supabase.from('runs')
        .select('user_id,name,score,max_streak,duration_seconds,finished_at')
        .eq('room_id', r.id);
      setRows((data ?? []).sort(sortRows));
    })();
  }, [ready, code, nav]);

  useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: room ? userId === room.created_by : false,
    onStart: () => {},
    onFinishBroadcast: (payload) => {
      setRows(prev => {
        const exists = prev.some(x => x.user_id === payload.user_id);
        const merged = exists ? prev.map(x => x.user_id === payload.user_id ? { ...x, ...payload } : x)
                              : [...prev, payload];
        return merged.sort(sortRows);
      });
    }
  });

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}>
      <div className="max-w-2xl mx-auto text-slate-100">
        <div className="card">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-extrabold">Leaderboard</h1>
            <div className="pill bg-white/10">Κωδικός: <span className="font-mono">{code}</span></div>
          </div>

          <table className="w-full mt-4 text-sm">
            <thead className="text-slate-300">
              <tr className="border-b border-white/10">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Όνομα</th>
                <th className="text-right py-2">Σκορ</th>
                <th className="text-right py-2">Χρόνος</th>
                <th className="text-right py-2">Σερί</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className="border-b border-white/5">
                  <td className="py-2">{i+1}</td>
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{r.score}</td>
                  <td className="py-2 text-right tabular-nums">{r.duration_seconds}s</td>
                  <td className="py-2 text-right tabular-nums">{r.max_streak ?? r.maxStreak ?? 0}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-slate-400">Κανείς δεν έχει ολοκληρώσει ακόμα…</td></tr>}
            </tbody>
          </table>

          <div className="mt-6 flex justify-between">
            <button className="btn btn-neutral" onClick={()=>nav(`/room/${code}`)}>← Lobby</button>
            <a className="btn btn-accent" href="/solo">Παίξε μόνος</a>
          </div>
        </div>
      </div>
    </div>
  );
}
