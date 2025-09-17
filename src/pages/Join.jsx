// src/pages/Join.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

export default function Join() {
  const { code } = useParams();
  const nav = useNavigate();
  const { ready, userId, name, setName } = useSupabaseAuth();

  const [tempName, setTempName] = useState(() => (name || '').trim());
  const canJoin = (tempName || '').trim().length >= 2;

  // Αν υπάρχει ήδη όνομα, δείξε το — αν όχι, άφησε τον χρήστη να το γράψει
  useEffect(() => {
    if ((name || '').trim() && !tempName) setTempName(name.trim());
  }, [name, tempName]);

  async function handleJoin() {
    if (!ready) return;
    const displayName = (tempName || '').trim().slice(0, 24);
    if (!displayName) { alert('Βάλε ένα όνομα εμφάνισης'); return; }

    try {
      setName(displayName); // το αποθηκεύει στο localStorage μέσω hook

      // Βρες το δωμάτιο από το code
      const { data: room, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', (code || '').toUpperCase())
        .single();

      if (error || !room) { alert('Το δωμάτιο δεν βρέθηκε'); return; }

      // Upsert participant για τον τωρινό χρήστη (RLS: user_id = auth.uid())
      const { error: upErr } = await supabase.from('participants').upsert(
        { room_id: room.id, user_id: userId, name: displayName, is_host: room.created_by === userId },
        { onConflict: 'room_id,user_id' }
      );
      if (upErr) { console.error(upErr); alert('Αποτυχία εισόδου στο δωμάτιο'); return; }

      // Πήγαινε στο lobby του δωματίου
      nav(`/room/${room.code}`);
    } catch (e) {
      console.error(e);
      alert('Κάτι πήγε στραβά');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
         style={{ background: 'linear-gradient(180deg,#223B57,#2F4E73)' }}>
      <div className="card w-full max-w-lg text-slate-100">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-extrabold">Μπες στο δωμάτιο</h1>
          <div className="pill bg-white/10">Κωδικός: <span className="font-mono">{(code || '').toUpperCase()}</span></div>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-300">Όνομα εμφάνισης</label>
          <input
            className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10"
            placeholder="π.χ. Goat"
            value={tempName}
            onChange={(e)=>setTempName(e.target.value)}
            maxLength={24}
            autoFocus
          />
        </div>

        <div className="mt-6 flex justify-between">
          <a className="btn btn-neutral" href="/">← Αρχική</a>
          <button className="btn btn-accent py-3 disabled:opacity-50"
                  onClick={handleJoin} disabled={!ready || !canJoin}>
            Μπες στο δωμάτιο
          </button>
        </div>
      </div>
    </div>
  );
}
