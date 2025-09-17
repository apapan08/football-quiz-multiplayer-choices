// src/pages/PlayRoom.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';
import QuizPrototype from '../App.jsx';
import ResultsOverlayV2 from '../components/ResultsOverlayV2.jsx';

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

  // Overlay
  const [showOverlay, setShowOverlay] = useState(false);
  const [mySeedRow, setMySeedRow] = useState(null);
  const [results, setResults] = useState([]); // kept (not strictly needed by V2 anymore)
  const [totalPlayers, setTotalPlayers] = useState(0);

  async function refreshResults() {
    const room = roomRef.current;
    if (!room) return;
    const [runsRes, partsRes] = await Promise.all([
      supabase
        .from('runs')
        .select('user_id,name,score,max_streak,duration_seconds,created_at')
        .eq('room_id', room.id),
      supabase
        .from('participants')
        .select('user_id')
        .eq('room_id', room.id),
    ]);
    if (runsRes.error) console.error('runs select error:', runsRes.error);
    if (partsRes.error) console.error('participants select error:', partsRes.error);
    const runs = runsRes.data || [];
    const parts = partsRes.data || [];
    runs.sort(
      (a, b) =>
        (b.score - a.score) ||
        ((a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9)) ||
        (new Date(a.created_at) - new Date(b.created_at))
    );
    setResults(runs);
    setTotalPlayers(parts.length || 0);
  }

  // Fetch room & upsert participant once we have userId
  useEffect(() => {
    if (!ready || !userId) return;
    let channel;
    (async () => {
      const { data: room, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (error || !room) {
        alert('Δωμάτιο δεν βρέθηκε');
        nav('/');
        return;
      }
      roomRef.current = room;

      // Register / ensure participant (RLS: user_id must equal auth.uid())
      const up = await supabase.from('participants').upsert(
        { room_id: room.id, user_id: userId, name: name || 'Player', is_host: room.created_by === userId },
        { onConflict: 'room_id,user_id' }
      );
      if (up.error) {
        console.error('participants upsert failed:', up.error);
      }

      await refreshResults();

      // Realtime: keep local "results"/counts updated (even though V2 fetches its own)
      channel = supabase
        .channel(`runs:${room.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'runs', filter: `room_id=eq.${room.id}` },
          refreshResults
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
          refreshResults
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [ready, userId, code, nav, name]);

  // Presence & finish broadcast
  const roomChannelData = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: false,
    onStart: () => {},
    onFinishBroadcast: () => refreshResults(),
  });
  const { broadcastFinish } = roomChannelData;

  const hasFinishedRef = useRef(false);

  async function onFinish({ score, maxStreak, durationSeconds }) {
    if (hasFinishedRef.current) return;
    if (!ready || !userId) return;

    hasFinishedRef.current = true;
    const room = roomRef.current;
    if (!room) return;

    // Upsert result
    const { error } = await supabase.from('runs').upsert(
      { room_id: room.id, user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds },
      { onConflict: 'room_id,user_id' }
    );
    if (error) {
      hasFinishedRef.current = false; // allow retry on real failure
      console.error('runs upsert failed:', error);
      alert('Αποτυχία καταχώρησης αποτελέσματος (δείτε console).');
      return;
    }

    // Broadcast finish & open overlay
    await broadcastFinish({ user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds });
    await refreshResults();
    setMySeedRow({
      user_id: userId,
      name: name || 'Player',
      score,
      duration_seconds: durationSeconds,
      created_at: new Date().toISOString(),
    });
    setShowOverlay(true);
  }

  return (
    <>
      {/* The quiz itself */}
      <QuizPrototype
        roomCode={code}
        startedAtOverride={startedAt}
        onFinish={onFinish}
        playerName={name || 'Player'}
        onOpenOverlayRequest={() => setShowOverlay(true)} 
      />

      {/* New two-tab overlay */}
      {showOverlay && (
        <ResultsOverlayV2
          onClose={() => setShowOverlay(false)}
          roomCode={code}
          youId={userId}
          seedRow={mySeedRow}
        />
      )}
    </>
  );
}
