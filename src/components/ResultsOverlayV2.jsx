// src/components/ResultsOverlayV2.jsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabaseClient";

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  const suf = s[(v - 20) % 10] || s[v] || s[0];
  return `${n}${suf.toUpperCase()}`;
}
function fmtTime(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const styles = {
  modal:"fixed inset-0 z-50 grid place-items-center p-4",
  backdrop:"absolute inset-0 bg-black/60",
  panel:"relative w-full max-w-2xl rounded-2xl bg-slate-900/95 ring-1 ring-white/10 shadow-xl overflow-hidden",
  header:"px-6 py-4 border-b border-white/10 flex items-center justify-between",
  title:"font-display text-2xl font-extrabold text-white",
  close:"w-9 h-9 rounded-xl bg-white text-slate-900 grid place-items-center font-bold",
  tabs:"px-3 pt-3 flex gap-2",
  tabBtn:"px-3 py-1.5 rounded-full text-sm font-bold",
  tabActive:"bg-pink-600 text-white",
  tabIdle:"bg-white/10 text-white/80 hover:bg-white/15",
  body:"px-3 pb-5 pt-2",
  tableWrap:"overflow-hidden rounded-xl ring-1 ring-white/10",
  table:"min-w-full text-sm text-slate-200",
  th:"text-left text-xs uppercase tracking-wide px-4 py-2 bg-white/5",
  td:"px-4 py-2 border-t border-white/10",
  youRow:"bg-lime-400/25",
};

function useRoomData(roomCode, youId, seedRow) {
  const [room, setRoom] = useState(null);
  const [runs, setRuns] = useState(seedRow ? [seedRow] : []);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...runs];
    arr.sort((a, b) =>
      (b.score - a.score) ||
      ((a.duration_seconds ?? 9e9) - (b.duration_seconds ?? 9e9)) ||
      (new Date(a.created_at) - new Date(b.created_at))
    );
    return arr;
  }, [runs]);

  useEffect(() => {
    if (!roomCode) return;
    let channel;
    (async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", roomCode).single();
      if (!r) return;
      setRoom(r);

      const [runsRes, partsRes] = await Promise.all([
        supabase
          .from("runs")
          .select("user_id,name,score,max_streak,duration_seconds,created_at")
          .eq("room_id", r.id),
        supabase
          .from("participants")
          .select("user_id")
          .eq("room_id", r.id),
      ]);

      const fromDb = runsRes.data || [];
      setRuns(prev => {
        const map = new Map();
        [...prev, ...fromDb].forEach(row => {
          if (!row) return;
          map.set(row.user_id, { ...(map.get(row.user_id) || {}), ...row });
        });
        return Array.from(map.values());
      });

      setTotalPlayers((partsRes.data || []).length);

      channel = supabase
        .channel(`overlay:${r.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "runs", filter: `room_id=eq.${r.id}` },
          (payload) => {
            const n = payload.new;
            setRuns(prev => {
              const i = prev.findIndex(x => x.user_id === n.user_id);
              if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], ...n }; return cp; }
              return [...prev, n];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "runs", filter: `room_id=eq.${r.id}` },
          (payload) => {
            const n = payload.new;
            setRuns(prev => {
              const i = prev.findIndex(x => x.user_id === n.user_id);
              if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], ...n }; return cp; }
              return [...prev, n];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${r.id}` },
          async () => {
            const { data } = await supabase.from("participants").select("user_id").eq("room_id", r.id);
            setTotalPlayers((data || []).length);
          }
        )
        .subscribe();
    })();

    return () => { try { channel && supabase.removeChannel(channel); } catch {} };
  }, [roomCode]);

  const yourRank = useMemo(() => {
    const idx = sorted.findIndex(r => r.user_id === youId);
    return idx >= 0 ? (idx + 1) : null;
  }, [sorted, youId]);

  return { room, rows: sorted, totalPlayers, yourRank };
}

function useGlobalAllTime(quizId = "default", youId = null) {
  const [top, setTop] = useState([]);
  const [yours, setYours] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const q1 = await supabase
        .from("leaderboard_public_runs")
        .select("user_id,name,score,duration_seconds,created_at")
        .eq("quiz_id", quizId)
        .order("score", { ascending: false })
        .order("duration_seconds", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      if (mounted && !q1.error) setTop(q1.data || []);

      if (youId) {
        const q2 = await supabase
          .from("leaderboard_public_runs")
          .select("user_id,name,score,duration_seconds,created_at")
          .eq("quiz_id", quizId)
          .eq("user_id", youId)
          .order("score", { ascending: false })
          .order("duration_seconds", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (mounted && !q2.error) setYours(q2.data || null);
      }
    })();
    return () => { mounted = false; };
  }, [quizId, youId]);

  return { top, yours };
}

export default function ResultsOverlayV2({ onClose, roomCode, youId, seedRow }) {
  const [tab, setTab] = useState("room"); // 'room' | 'global'
  const { rows, totalPlayers, yourRank } = useRoomData(roomCode, youId, seedRow);
  const { top, yours } = useGlobalAllTime("default", youId);

  const finished = rows.length;
  const total = Math.max(totalPlayers, finished || 1);
  const statusText =
    finished < total
      ? `${finished} LIVE OUT OF ${total}`
      : `${ordinal(yourRank || 1)} OUT OF ${total}`;

  return (
    <div className={styles.modal} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>
            {tab === "room" ? "Room Leaderboard" : "Global Leaderboard (All submissions)"}
          </div>
          <button onClick={onClose} className={styles.close} aria-label="Close">×</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === "room" ? styles.tabActive : styles.tabIdle}`}
            onClick={() => setTab("room")}
          >
            Room
          </button>
          <button
            className={`${styles.tabBtn} ${tab === "global" ? styles.tabActive : styles.tabIdle}`}
            onClick={() => setTab("global")}
          >
            Global
          </button>
        </div>

        <div className={styles.body}>
          {tab === "room" ? (
            <>
              <div className="px-2 pb-2 text-slate-300 text-sm">
                {statusText}
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>#</th>
                      <th className={styles.th}>Name</th>
                      <th className={styles.th}>Time</th>
                      <th className={styles.th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.user_id} className={r.user_id === youId ? styles.youRow : undefined}>
                        <td className={styles.td}>{i + 1}</td>
                        <td className={styles.td}>
                          <span className="font-semibold">{r.name}</span>
                          {r.user_id === youId && (
                            <span className="ml-2 text-[10px] font-extrabold bg-white text-black rounded px-1.5 py-0.5 align-middle">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className={styles.td}>{fmtTime(r.duration_seconds)}</td>
                        <td className={styles.td}>{r.score}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td className={styles.td} colSpan={4}>Waiting for results…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="px-2 pb-2 text-slate-300 text-sm">
                Showing Top 50 — <span className="text-slate-400">All submissions (duplicates allowed)</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>#</th>
                      <th className={styles.th}>Name</th>
                      <th className={styles.th}>Time</th>
                      <th className={styles.th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r, i) => (
                      <tr key={`${r.user_id}-${r.created_at}-${i}`} className={r.user_id === youId ? styles.youRow : undefined}>
                        <td className={styles.td}>{i + 1}</td>
                        <td className={styles.td}>
                          <span className="font-semibold">{r.name}</span>
                          {r.user_id === youId && (
                            <span className="ml-2 text-[10px] font-extrabold bg-white text-black rounded px-1.5 py-0.5 align-middle">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className={styles.td}>{fmtTime(r.duration_seconds)}</td>
                        <td className={styles.td}>{r.score}</td>
                      </tr>
                    ))}
                    {top.length === 0 && (
                      <tr><td className={styles.td} colSpan={4}>No submissions yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {yours && !top.some(t => t.user_id === youId) && (
                <div className="mt-3 text-xs text-slate-300">
                  Your best all-time: <b>{yours.score}</b> in <b>{fmtTime(yours.duration_seconds)}</b> — outside Top 50
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
