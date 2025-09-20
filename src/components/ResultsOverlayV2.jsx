// src/components/ResultsOverlayV2.jsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabaseClient";
import { QUIZ_ID } from "../lib/quizVersion";

// ---------- helpers ----------
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  const suf = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suf.toUpperCase()}`;
}
function fmtTime(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// NOTE: runs table uses finished_at (not created_at)
const RUNS_COLS = "user_id,name,score,max_streak,duration_seconds,finished_at";
// Global table has created_at (we fetch it for stable sorting/keys; not shown in UI)
const GLB_COLS = "user_id,name,score,duration_seconds,created_at";

// ---------- room data ----------
function useRoomData(roomCode, youId, seedRow) {
  const [room, setRoom] = useState(null);
  const [runs, setRuns] = useState(seedRow ? [seedRow] : []);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...runs];
    arr.sort(
      (a, b) =>
        b.score - a.score ||
        (a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9) ||
        new Date(a.finished_at ?? 0) - new Date(b.finished_at ?? 0)
    );
    return arr;
  }, [runs]);

  useEffect(() => {
    if (!roomCode) return;
    let channel;
    let cancelled = false;

    (async () => {
      const { data: r, error: rErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .single();
      if (rErr || !r) {
        console.error("[overlay] rooms select error:", rErr);
        return;
      }
      setRoom(r);

      const [runsRes, partsRes] = await Promise.all([
        supabase.from("runs").select(RUNS_COLS).eq("room_id", r.id),
        supabase.from("participants").select("user_id").eq("room_id", r.id),
      ]);
      if (runsRes.error) console.error("[overlay] runs select error:", runsRes.error);
      if (partsRes.error)
        console.error("[overlay] participants select error:", partsRes.error);

      if (!cancelled && runsRes.data) setRuns(runsRes.data); // DB snapshot
      if (!cancelled && partsRes.data) setTotalPlayers(partsRes.data.length);

      const upsertRun = (n) => {
        setRuns((prev) => {
          const i = prev.findIndex((x) => x.user_id === n.user_id);
          if (i >= 0) {
            const cp = [...prev];
            cp[i] = { ...cp[i], ...n };
            return cp;
          }
          return [...prev, n];
        });
      };

      channel = supabase
        .channel(`overlay:${r.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "runs", filter: `room_id=eq.${r.id}` },
          (payload) => upsertRun(payload.new)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "runs", filter: `room_id=eq.${r.id}` },
          (payload) => upsertRun(payload.new)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${r.id}` },
          async () => {
            const { data, error } = await supabase
              .from("participants")
              .select("user_id")
              .eq("room_id", r.id);
            if (error) console.error("[overlay] participants refresh error:", error);
            setTotalPlayers((data || []).length);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      try {
        channel && supabase.removeChannel(channel);
      } catch {}
    };
  }, [roomCode]);

  const yourRank = useMemo(() => {
    const idx = sorted.findIndex((r) => r.user_id === youId);
    return idx >= 0 ? idx + 1 : null;
  }, [sorted, youId]);

  return { room, rows: sorted, totalPlayers, yourRank };
}

// ---------- global (scoped by QUIZ_ID) ----------
function useGlobalAllTime(quizId = "default", youId = null, refreshSignal = 0) {
  const [top, setTop] = useState([]);
  const [yours, setYours] = useState(null);

  useEffect(() => {
    let mounted = true;
    let channel;

    const sortFn = (a, b) =>
      b.score - a.score ||
      (a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9) ||
      new Date(a.created_at) - new Date(b.created_at);

    const load = async () => {
      const q1 = await supabase
        .from("leaderboard_public_runs")
        .select(GLB_COLS)
        .eq("quiz_id", quizId)
        .order("score", { ascending: false })
        .order("duration_seconds", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      if (q1.error) console.error("[overlay] leaderboard top error:", q1.error);
      if (mounted && !q1.error) setTop(q1.data || []);

      if (youId) {
        const q2 = await supabase
          .from("leaderboard_public_runs")
          .select(GLB_COLS)
          .eq("quiz_id", quizId)
          .eq("user_id", youId)
          .order("score", { ascending: false })
          .order("duration_seconds", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (q2.error) console.error("[overlay] leaderboard yours error:", q2.error);
        if (mounted && !q2.error) setYours(q2.data || null);
      }
    };

    load(); // initial (and on refreshSignal change)

    // Realtime inserts
    channel = supabase
      .channel(`global:${quizId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leaderboard_public_runs", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          const n = payload.new;
          setTop((prev) => {
            const next = [n, ...prev];
            next.sort(sortFn);
            return next.slice(0, 50);
          });
          if (youId && n.user_id === youId) {
            setYours((y) => {
              if (!y) return n;
              const better =
                n.score > y.score ||
                (n.score === y.score && (n.duration_seconds ?? 9e9) < (y.duration_seconds ?? 9e9));
              return better ? n : y;
            });
          }
        }
      )
      .subscribe();

  return () => {
      try {
        channel && supabase.removeChannel(channel);
      } catch {}
    };
  }, [quizId, youId, refreshSignal]);

  return { top, yours };
}

// ---------- component (Room <-> Global; Global-only when solo) ----------
export default function ResultsOverlayV2({
  onClose,
  roomCode,
  youId,
  seedRow,
  view,          // optional initial view from parent
  onViewChange,
  refreshSignal = 0,  
}) {
  const soloMode = !roomCode;
  const { room, rows, totalPlayers, yourRank } = useRoomData(roomCode, youId, seedRow);
  const finished = rows.length;
  const reloadKey = (finished || 0) + (refreshSignal || 0); // ← NEW
  const { top /*, yours*/ } = useGlobalAllTime(QUIZ_ID, youId, reloadKey);
  const total = Math.max(totalPlayers, finished || 1);

  // Default to Global when SOLO, else Room
  const [internalView, setInternalView] = useState(soloMode ? "global" : "room");
  useEffect(() => {
    if (view) setInternalView(view);
  }, [view]);

  function setView(next) {
    if (onViewChange) onViewChange(next);
    setInternalView(next);
  }

  // Live status or placement chip (room)
  let statusText;
  if (finished < total) {
    statusText = `${finished} LIVE OUT OF ${total}`;
  } else {
    const rank = yourRank || 1;
    const ord = ordinal(rank); // e.g., 1ST, 2ND...
    statusText = `${ord} / ${total}`;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md sm:max-w-2xl h-[90vh] bg-slate-900/95 ring-1 ring-white/10 rounded-2xl overflow-hidden flex flex-col shadow-xl">
        {/* header */}
        <div className="px-6 py-4 border-b border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="font-display text-2xl font-extrabold text-white">
              {internalView === "room" ? "Κατάταξη Δωματίου" : "Συνολική Κατάταξη"}
            </div>
            <button onClick={onClose} className="btn btn-accent px-3 py-1.5 rounded-xl" aria-label="Close">
              ×
            </button>
          </div>

          <div className="text-sm text-slate-300" aria-live="polite">
            {internalView === "room" ? statusText : <>Πρώτοι 50</>}
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {internalView === "room" && (
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
              <table className="min-w-full text-sm text-slate-200">
                <thead>
                  <tr>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">#</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Όνομα</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Χρόνος</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Σκορ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.user_id} className={r.user_id === youId ? "bg-lime-400/25" : undefined}>
                      <td className="px-4 py-2 border-t border-white/10">{i + 1}</td>
                      <td className="px-4 py-2 border-t border-white/10">
                        <span className="font-semibold">{r.name}</span>
                        {r.user_id === youId && (
                          <span className="ml-2 text-[10px] font-extrabold bg-white text-black rounded px-1.5 py-0.5 align-middle">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 border-t border-white/10">{fmtTime(r.duration_seconds)}</td>
                      <td className="px-4 py-2 border-t border-white/10">{r.score}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-2 border-t border-white/10" colSpan={4}>
                        Περιμένουμε αποτελέσματα…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {internalView === "global" && (
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
              <table className="min-w-full text-sm text-slate-200">
                <thead>
                  <tr>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">#</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Όνομα</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Χρόνος</th>
                    <th className="text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5">Σκορ</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r, i) => (
                    <tr key={`${r.user_id}-${r.created_at}-${i}`} className={r.user_id === youId ? "bg-lime-400/25" : undefined}>
                      <td className="px-4 py-2 border-t border-white/10">{i + 1}</td>
                      <td className="px-4 py-2 border-t border-white/10">
                        <span className="font-semibold">{r.name}</span>
                        {r.user_id === youId && (
                          <span className="ml-2 text-[10px] font-extrabold bg-white text-black rounded px-1.5 py-0.5 align-middle">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 border-t border-white/10">{fmtTime(r.duration_seconds)}</td>
                      <td className="px-4 py-2 border-t border-white/10">{r.score}</td>
                    </tr>
                  ))}
                  {top.length === 0 && (
                    <tr>
                      <td className="px-4 py-2 border-t border-white/10" colSpan={4}>
                        Δεν υπάρχουν συμμετοχές ακόμη
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* footer: show switcher only if we have a room (multiplayer) */}
        {!soloMode && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col gap-2">
            {internalView === "room" ? (
              <button className="btn btn-accent w-full" onClick={() => setView("global")}>
                Συνολική Κατάταξη
              </button>
            ) : (
              <button className="btn btn-accent w-full" onClick={() => setView("room")}>
                Κατάταξη Δωματίου
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
