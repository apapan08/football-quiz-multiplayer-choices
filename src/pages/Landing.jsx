import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { Logo } from "../App.jsx";
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8 text-center">
        <Logo className="mx-auto h-48 w-auto" />

        <div>
          <label className="block text-base font-medium text-text">Το όνομα σου</label>
          <input
            className="mt-1 w-full rounded-lg px-4 py-3 outline-none bg-slate-100 text-text border border-slate-300 focus:ring-2 focus:ring-primary text-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="π.χ. Goat"
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col space-y-4">
          <a href="/solo" className="btn btn-accent text-xl font-bold py-4 px-8 inline-block">
            Παίξε μόνος
          </a>

          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-slate-300"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-sm">ή παίξε με φίλους</span>
            <div className="flex-grow border-t border-slate-300"></div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg space-y-6">
            <button className="btn btn-neutral w-full text-lg py-3" onClick={createRoom} disabled={!canCreate}>
              Δημιούργησε δωμάτιο
            </button>

            <div className="space-y-2">
              <input
                className="w-full rounded-lg px-4 py-3 outline-none uppercase bg-slate-100 text-text border border-slate-300 focus:ring-2 focus:ring-primary text-lg"
                placeholder="ΚΩΔΙΚΟΣ (π.χ. ABCDE)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn w-full text-lg py-3" style={{ backgroundColor: '#f97316', color: 'white' }} onClick={joinRoom} disabled={!canJoin}>
                Μπες με κωδικό
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
