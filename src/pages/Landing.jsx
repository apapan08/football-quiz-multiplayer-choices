// src/pages/Landing.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { generateUniqueRoomCode } from '../lib/roomCode';
import { QUIZ_ID } from '../lib/quizVersion';

export default function Landing() {
  const nav = useNavigate();
  const { ready, userId, name, setName } = useSupabaseAuth();
  const [code, setCode] = useState('');

  async function createRoom() {
    if (!ready || !userId) return;
    if (!name.trim()) { alert('Βάλε ένα όνομα εμφάνισης'); return; }

    const roomCode = await generateUniqueRoomCode();
    const { data: room, error: e1 } = await supabase
      .from('rooms')
      .insert({
        code: roomCode,
        created_by: userId,
        status: 'lobby',
        settings: {},
        quiz_id: QUIZ_ID,       // ← version tag
      })
      .select('*')
      .single();

    if (e1 || !room) { alert(e1?.message || 'Αποτυχία δημιουργίας δωματίου'); return; }

    await supabase
      .from('participants')
      .upsert({ room_id: room.id, user_id: userId, name, is_host: true }, { onConflict: 'room_id,user_id' });

    nav(`/room/${room.code}`);
  }

  async function joinRoom() {
    if (!ready || !userId) return;

    const c = (code || '').trim().toUpperCase();
    if (!c || c.length !== 5) { alert('Έγκυρος κωδικός 5 γραμμάτων'); return; }
    if (!name.trim()) { alert('Βάλε ένα όνομα εμφάνισης'); return; }

    // Prefer current version, but gracefully fall back for legacy rooms
    let { data: room, error } = await supabase.from('rooms')
      .select('*').eq('code', c).eq('quiz_id', QUIZ_ID).maybeSingle();
    if (!room) {
      const fallback = await supabase.from('rooms').select('*').eq('code', c).maybeSingle();
      room = fallback.data; error = fallback.error;
    }
    if (error || !room) { alert('Το δωμάτιο δεν βρέθηκε'); return; }

    await supabase
      .from('participants')
      .upsert({ room_id: room.id, user_id: userId, name, is_host: false }, { onConflict: 'room_id,user_id' });

    nav(`/room/${room.code}`);
  }

  const canCreate = ready && !!name.trim();
  const canJoin = ready && !!name.trim() && (code || '').trim().length === 5;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}
    >
      <div className="card w-full max-w-3xl text-slate-100">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold text-center">Ποδοσφαιρικό Κουίζ</h1>

        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-300">Όνομα εμφάνισης</label>
          <input
            className="w-full rounded-2xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="π.χ. Goat"
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-stretch gap-3">
          <button className="btn btn-accent w-full sm:w-auto" onClick={createRoom} disabled={!canCreate}>
            Δημιούργησε Δωμάτιο
          </button>

          <div className="flex-1 min-w-0">
            <input
              className="w-full rounded-2xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400 uppercase"
              placeholder="ΚΩΔΙΚΟΣ (π.χ. ABCDE)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
              maxLength={5}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <button className="btn btn-neutral w-full sm:w-auto shrink-0 whitespace-nowrap" onClick={joinRoom} disabled={!canJoin}>
            Μπες
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-slate-300">
          Θες μόνος σου; <a className="underline" href="/solo">Παίξε μόνος</a>
        </div>
      </div>
    </div>
  );
}
