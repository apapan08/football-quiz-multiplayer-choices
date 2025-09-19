// src/pages/Join.jsx
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { QUIZ_ID } from '../lib/quizVersion';

export default function Join() {
  const { code } = useParams();
  const nav = useNavigate();
  const { ready, userId, setName } = useSupabaseAuth();

  const [tempName, setTempName] = useState('');
  const canJoin = (tempName || '').trim().length >= 2;

  async function handleJoin() {
    if (!ready) return;
    const displayName = (tempName || '').trim().slice(0, 24);
    if (!displayName) { alert('Βάλε ένα όνομα εμφάνισης'); return; }

    try {
      setName(displayName);

      // Prefer current QUIZ_ID, fallback to legacy
      let { data: room } = await supabase
        .from('rooms').select('*')
        .eq('code', (code || '').toUpperCase())
        .eq('quiz_id', QUIZ_ID)
        .maybeSingle();

      if (!room) {
        const fb = await supabase.from('rooms').select('*')
          .eq('code', (code || '').toUpperCase())
          .maybeSingle();
        room = fb.data;
      }

      if (!room) { alert('Το δωμάτιο δεν βρέθηκε'); return; }

      const { error: upErr } = await supabase.from('participants').upsert(
        { room_id: room.id, user_id: userId, name: displayName, is_host: room.created_by === userId },
        { onConflict: 'room_id,user_id' }
      );
      if (upErr) { console.error(upErr); alert('Αποτυχία εισόδου στο δωμάτιο'); return; }

      nav(`/room/${room.code}`);
    } catch (e) {
      console.error(e);
      alert('Κάτι πήγε στραβά');
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}
    >
      <div className="card w-full max-w-lg text-slate-100">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold">Μπες στο δωμάτιο</h1>
          <div className="pill bg-white/10 whitespace-nowrap">
            Κωδικός: <span className="font-mono">{(code || '').toUpperCase()}</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-300">Όνομα εμφάνισης</label>
          <input
            className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
            placeholder="π.χ. Goat"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            maxLength={24}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <a className="btn btn-neutral w-full sm:w-auto" href="/">← Αρχική</a>
          <button
            className="btn btn-neutral w-full sm:w-auto whitespace-nowrap disabled:opacity-50"
            onClick={handleJoin}
            disabled={!ready || !canJoin}
          >
            Μπες
          </button>
        </div>
      </div>
    </div>
  );
}
