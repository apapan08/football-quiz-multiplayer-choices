// src/pages/PlayRoom.jsx
import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase  from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';
import QuizPrototype from '../App.jsx'; // reuse existing component

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function PlayRoom() {
  const { code } = useParams();
  const nav = useNavigate();
  const q = useQuery();
  const startedAt = Number(q.get('t')) || Date.now();

  const { ready, userId, name } = useSupabaseAuth();
  const roomRef = useRef(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data: room, error } = await supabase.from('rooms').select('*').eq('code', code).single();
      if (error || !room) { alert('Δωμάτιο δεν βρέθηκε'); nav('/'); return; }
      roomRef.current = room;
      // ensure participant row
      await supabase.from('participants').upsert({
        room_id: room.id, user_id: userId, name: name || 'Player', is_host: room.created_by === userId
      }, { onConflict: 'room_id,user_id' });
    })();
  }, [ready, code, nav, userId, name]);

  const { broadcastFinish, markFinishedInPresence } = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: false,
    onStart: () => {},
    onFinishBroadcast: () => {}
  });

  async function onFinish({ score, maxStreak, durationSeconds }) {
    const room = roomRef.current;
    if (!room) return;
    // persist run
    await supabase.from('runs').insert({
      room_id: room.id,
      user_id: userId,
      name: name || 'Player',
      score,
      max_streak: maxStreak,
      duration_seconds: durationSeconds
    });
    // broadcast finish
    await broadcastFinish({
      user_id: userId,
      name: name || 'Player',
      score,
      max_streak: maxStreak,
      duration_seconds: durationSeconds
    });
    await markFinishedInPresence();
    nav(`/room/${code}/leaderboard`);
  }

  return (
    <QuizPrototype
      roomCode={code}
      startedAtOverride={startedAt}
      onFinish={onFinish}
    />
  );
}
