// src/pages/PlayRoom.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';
import QuizPrototype from '../App.jsx';
import ResultsOverlayV2 from '../components/ResultsOverlayV2.jsx';
import { QUIZ_ID } from '../lib/quizVersion';

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

  const [showOverlay, setShowOverlay] = useState(false);
  const [mySeedRow, setMySeedRow] = useState(null);
  const [myResultRows, setMyResultRows] = useState([]);
  const [overlayView, setOverlayView] = useState(null);
  const [results, setResults] = useState([]);
  const [totalPlayers, setTotalPlayers] = useState(0);

  async function refreshResults() {
    const room = roomRef.current;
    if (!room) return;
    const [runsRes, partsRes] = await Promise.all([
      supabase.from('runs').select('user_id,name,score,max_streak,duration_seconds,finished_at').eq('room_id', room.id),
      supabase.from('participants').select('user_id').eq('room_id', room.id),
    ]);
    const runs = (runsRes.data || []).sort(
      (a, b) =>
        (b.score - a.score) ||
        ((a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9)) ||
        (new Date(a.finished_at ?? 0) - new Date(b.finished_at ?? 0))
    );
    setResults(runs);
    setTotalPlayers((partsRes.data || []).length || 0);
  }

  useEffect(() => {
    if (!ready || !userId) return;
    let channel;
    (async () => {
      // Prefer current version, but allow legacy rooms by code only
      let r = await supabase.from('rooms').select('*').eq('code', code).eq('quiz_id', QUIZ_ID).maybeSingle();
      let room = r.data;
      if (!room) {
        const fb = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
        room = fb.data;
      }
      if (!room) { alert('Δωμάτιο δεν βρέθηκε'); nav('/'); return; }
      roomRef.current = room;

      const up = await supabase.from('participants').upsert(
        { room_id: room.id, user_id: userId, name: name || 'Player', is_host: room.created_by === userId },
        { onConflict: 'room_id,user_id' }
      );
      if (up.error) console.error('participants upsert failed:', up.error);

      await refreshResults();

      channel = supabase
        .channel(`runs:${room.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'runs', filter: `room_id=eq.${room.id}` }, refreshResults)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` }, refreshResults)
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [ready, userId, code, nav, name]);

  const roomChannelData = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: false,
    onStart: () => {},
    onFinishBroadcast: () => refreshResults(),
  });
  const { broadcastFinish } = roomChannelData;

  console.log('nav in PlayRoom:', nav);

  const hasFinishedRef = useRef(false);

  async function onFinish({ score, maxStreak, durationSeconds, resultRows }) {
    if (hasFinishedRef.current) return;
    if (!ready || !userId) return;
    hasFinishedRef.current = true;

    const room = roomRef.current;
    if (!room) return;

    const { error } = await supabase.from('runs').upsert(
      {
        room_id: room.id,
        user_id: userId,
        name: name || 'Player',
        score,
        max_streak: maxStreak,
        duration_seconds: durationSeconds,
        finished_at: new Date().toISOString(),
        quiz_id: QUIZ_ID,           // ← version tag for runs
      },
      { onConflict: 'room_id,user_id' }
    );
    if (error) {
      hasFinishedRef.current = false;
      console.error('runs upsert failed:', error);
      alert('Αποτυχία καταχώρησης αποτελέσματος (δείτε console).');
      return;
    }

    await broadcastFinish({ user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds });
    await refreshResults();

    setMySeedRow({ user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds, finished_at: new Date().toISOString() });
    if (Array.isArray(resultRows)) setMyResultRows(resultRows);
    setOverlayView('room');
    setShowOverlay(true);
  }

  return (
    <>
      <QuizPrototype
        roomCode={code}
        startedAtOverride={startedAt}
        onFinish={onFinish}
        playerName={name || 'Player'}
        onOpenOverlayRequest={() => setShowOverlay(true)}
        onNavigateHome={nav}
      />

      {showOverlay && (
        <ResultsOverlayV2
          onClose={() => setShowOverlay(false)}
          roomCode={code}
          youId={userId}
          seedRow={mySeedRow}
          view={overlayView}
          onViewChange={(v) => setOverlayView(v)}
          myResultRows={myResultRows}
          myScore={mySeedRow?.score}
          myMaxStreak={mySeedRow?.max_streak}
          playerName={name || 'Player'}
        />
      )}
    </>
  );
}
