// src/pages/PlayRoom.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import supabase from '../lib/supabaseClient';
import useRoomChannel from '../hooks/useRoomChannel';
import QuizPrototype from '../App.jsx';

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
  const channelRef = useRef(null); // Store channel reference for manual tracking

  // Popup state
  const [showOverlay, setShowOverlay] = useState(false);
  const [results, setResults] = useState([]); // [{user_id,name,score,max_streak,duration_seconds,created_at}]
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

    let channel; // realtime channel ref

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

      // Register/ensure me as participant (respect RLS: user_id must equal auth.uid())
      const up = await supabase.from('participants').upsert(
        { room_id: room.id, user_id: userId, name: name || 'Player', is_host: room.created_by === userId },
        { onConflict: 'room_id,user_id' }
      );
      if (up.error) {
        console.error('participants upsert failed:', up.error);
      }

      // Initial snapshot
      await refreshResults();

      // Realtime: update overlay as new runs arrive in this room
      channel = supabase
        .channel(`runs:${room.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'runs', filter: `room_id=eq.${room.id}` },
          () => refreshResults()
        )
        // (Optional) track roster updates if you want OUT OF N to tick live:
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
          () => refreshResults()
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [ready, userId, code, nav, name]);

  // Fixed: Only destructure functions that actually exist in useRoomChannel
  const roomChannelData = useRoomChannel({
    code,
    user_id: userId,
    name: name || 'Player',
    is_host: false,
    onStart: () => {},
    onFinishBroadcast: () => refreshResults(),
  });
  
  const { broadcastFinish } = roomChannelData;
  // Store the channel reference if we need it for manual presence updates
  useEffect(() => {
    if (roomChannelData.channel) {
      channelRef.current = roomChannelData.channel;
    }
  }, [roomChannelData.channel]);

  const hasFinishedRef = useRef(false);

  async function onFinish({ score, maxStreak, durationSeconds }) {
    if (hasFinishedRef.current) return;
    if (!ready || !userId) return;

    hasFinishedRef.current = true;
    const room = roomRef.current;
    if (!room) return;

    // (choose upsert OR insert+duplicate handling)
    const { error } = await supabase.from('runs').upsert(
      { room_id: room.id, user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds },
      { onConflict: 'room_id,user_id' }
    );
    if (error) {
      hasFinishedRef.current = false; // allow retry only on real failure
      console.error('runs upsert failed:', error);
      alert('Αποτυχία καταχώρησης αποτελέσματος (δείτε console).');
      return;
    }

    // Broadcast finish event with the score data
    await broadcastFinish({ user_id: userId, name: name || 'Player', score, max_streak: maxStreak, duration_seconds: durationSeconds });
    
    // Note: The finished status is already tracked in the broadcastFinish function
    // in useRoomChannel.js (it calls channel.track with finished: true)

    await refreshResults();
    setShowOverlay(true);
  }

  return (
    <>
      <QuizPrototype
        roomCode={code}
        startedAtOverride={startedAt}
        onFinish={onFinish}
        playerName={(name || 'Player').trim()}
      />

      {showOverlay && (
        <ResultsOverlay
          onClose={() => setShowOverlay(false)}
          youId={userId}
          results={results}
          totalPlayers={totalPlayers}
          roomCode={code}
        />
      )}
    </>
  );
}

/* Minimal overlay component; style as needed */
function ResultsOverlay({ onClose, youId, results, totalPlayers, roomCode }) {
  const rankOfYou = results.findIndex((r) => r.user_id === youId) + 1 || 0;
  const placeText = rankOfYou ? ordinal(rankOfYou) : 'LIVE';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + `/room/${roomCode}/leaderboard`
      );
    } catch {}
  };
  const shareScore = async () => {
    const me = results.find((r) => r.user_id === youId);
    const text = me ? `I scored ${me.score} in OnlyFootballFans Quiz!` : 'OnlyFootballFans Quiz';
    try {
      if (navigator.share) await navigator.share({ title: 'Quiz Score', text, url: window.location.href });
      else await navigator.clipboard.writeText(`${text} ${window.location.href}`);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[min(640px,92vw)] rounded-2xl shadow-xl ring-1 ring-white/10 p-5 bg-slate-900 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-4xl font-extrabold">{placeText}</div>
            <div className="text-sm text-slate-300">
              OUT OF {Math.max(totalPlayers, results.length || 1)}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1">
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn btn-accent py-3" onClick={shareScore}>
            Share Score
          </button>
          <button className="btn btn-neutral py-3" onClick={copyLink}>
            Copy Link
          </button>
        </div>

        <div className="mt-5">
          <div className="text-xs text-slate-400 mb-2">LIVE</div>
          <div className="divide-y divide-white/10 rounded-xl overflow-hidden ring-1 ring-white/10">
            {results.map((r, i) => (
              <div
                key={r.user_id}
                className={`flex items-center justify-between px-3 py-2 ${
                  r.user_id === youId ? 'bg-lime-400 text-black' : 'bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right">{i + 1}</span>
                  <span className="font-semibold">{r.name}</span>
                  {r.user_id === youId && (
                    <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black text-white">
                      YOU
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="tabular-nums">{formatDuration(r.duration_seconds)}</span>
                  <span className="font-bold tabular-nums">{r.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-right">
          <a
            className="underline text-sm text-slate-300"
            href={`/room/${roomCode}/leaderboard`}
          >
            Full leaderboard →
          </a>
        </div>
      </div>
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'],
    v = n % 100;
  const suf = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suf.toUpperCase()}`;
}
function formatDuration(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}