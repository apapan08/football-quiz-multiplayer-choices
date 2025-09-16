// src/pages/Landing.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { generateUniqueRoomCode } from '../lib/roomCode';

export default function Landing() {
  const nav = useNavigate();
  const { ready, userId, name, setName } = useSupabaseAuth();
  const [code, setCode] = useState('');

  async function createRoom() {
    if (!ready || !userId) return;
    if (!name.trim()) { alert('Βάλε ένα όνομα εμφάνισης'); return; }
    const client = supabase;
    const roomCode = await generateUniqueRoomCode();
    const { data: room, error: e1 } = await client
      .from('rooms')
      .insert({ code: roomCode, created_by: userId, status: 'lobby', settings: {} })
      .select('*')
      .single();
    if (e1) { alert(e1.message); return; }

    await client.from('participants')
      .upsert({ room_id: room.id, user_id: userId, name, is_host: true }, { onConflict: 'room_id,user_id' });

    nav(`/room/${room.code}`);
  }

  async function joinRoom() {
    const c = (code || '').toUpperCase().trim();
    if (!c || c.length !== 5) { alert('Έγκυρος κωδικός 5 γραμμάτων'); return; }
    if (!name.trim()) { alert('Βάλε ένα όνομα εμφάνισης'); return; }
    const client = supabase;
    const { data: room, error } = await client.from('rooms').select('*').eq('code', c).single();
    if (error || !room) { alert('Το δωμάτιο δεν βρέθηκε'); return; }
    await client.from('participants')
      .upsert({ room_id: room.id, user_id: userId, name, is_host: false }, { onConflict: 'room_id,user_id' });
    nav(`/room/${room.code}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
         style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}>
      <div className="card w-full max-w-lg text-slate-100">
        <h1 className="font-display text-3xl font-extrabold text-center">Ποδοσφαιρικό Κουίζ</h1>
        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-300">Όνομα εμφάνισης</label>
          <input className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10"
                 value={name} onChange={(e)=>setName(e.target.value)} placeholder="π.χ. Goat" />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button className="btn btn-accent py-3" onClick={createRoom} disabled={!ready}>Δημιούργησε Δωμάτιο</button>
          <div className="flex gap-2">
            <input className="flex-1 rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 uppercase"
                   placeholder="Κωδικός (π.χ. ABCDE)" value={code} onChange={(e)=>setCode(e.target.value)} maxLength={5} />
            <button className="btn btn-neutral px-4" onClick={joinRoom} disabled={!ready}>Μπες</button>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-slate-300">
          Θες μόνος σου; <a className="underline" href="/solo">Παίξε σόλο</a>
        </div>
      </div>
    </div>
  );
}
