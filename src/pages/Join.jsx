// src/pages/Join.jsx
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { QUIZ_ID } from '../lib/quizVersion';

import { Logo } from "../App.jsx";

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
      style={{ background: 'var(--background-color)' }}
    >
      <div className="card w-full max-w-lg" style={{ backgroundColor: 'var(--surface-color)', color: 'var(--text-color)' }}>
        <Logo className="mx-auto h-48 w-auto" />
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold">Μπες στο δωμάτιο</h1>
          <div className="pill whitespace-nowrap">
            Κωδικός: <span className="font-mono">{(code || '').toUpperCase()}</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block text-sm" style={{ color: 'var(--text-color-secondary)' }}>Όνομα εμφάνισης</label>
          <input
            className="w-full rounded-lg px-4 py-3 outline-none"
            style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
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
            className="btn btn-accent w-full sm:w-auto whitespace-nowrap disabled:opacity-50"
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
