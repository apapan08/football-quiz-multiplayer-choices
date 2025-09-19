// src/pages/Solo.jsx
import React, { useRef, useState } from "react";
import QuizPrototype from "../App.jsx";
import ResultsOverlayV2 from "../components/ResultsOverlayV2.jsx";
import { useSupabaseAuth } from "../hooks/useSupabaseAuth";
import supabase from "../lib/supabaseClient";
import { QUIZ_ID } from "../lib/quizVersion";

const NAME_KEY = "display_name_v1";
function getDisplayName(fallback) {
  try {
    const v = (localStorage.getItem(NAME_KEY) || "").trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export default function Solo() {
  const { ready, userId, name, setName } = useSupabaseAuth();
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayView, setOverlayView] = useState("global");
  const [refreshTick, setRefreshTick] = useState(0); // ← bump after successful insert
  const mySeedRowRef = useRef(null);

  async function upsertSoloRun({ score, maxStreak, durationSeconds }) {
    if (!ready || !userId) return { ok: false };

    const displayName = getDisplayName(name) || 'Player';

    const payload = {
      room_id: null,              // SOLO
      user_id: userId,
      name: displayName,
      score,
      max_streak: maxStreak,
      duration_seconds: durationSeconds,
      finished_at: new Date().toISOString(),
      quiz_id: QUIZ_ID,          // version scope
    };

    // Try update existing solo row for this user+quiz; else insert
    const upd = await supabase
      .from("runs")
      .update(payload)
      .is("room_id", null)
      .eq("user_id", userId)
      .eq("quiz_id", QUIZ_ID)
      .select("user_id")
      .limit(1);

    if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
      return { ok: true, name: displayName };
    }

    const ins = await supabase.from("runs").insert(payload);
    if (ins.error) {
      console.error("[solo] insert runs failed:", ins.error);
      return { ok: false, error: ins.error };
    }
    return { ok: true, name: displayName };
  }

  async function onFinish({ score, maxStreak, durationSeconds }) {
    const res = await upsertSoloRun({ score, maxStreak, durationSeconds });
    if (!res.ok) {
      alert("Αποτυχία καταχώρησης αποτελέσματος (δείτε console).");
      return;
    }

    // Seed a minimal row (for highlighting “YOU” if needed)
    mySeedRowRef.current = {
      user_id: userId,
      name: res.name || name || "Player",
      score,
      max_streak: maxStreak,
      duration_seconds: durationSeconds,
      finished_at: new Date().toISOString(),
    };

    // Force an immediate reload of Global leaderboard queries
    setRefreshTick((t) => t + 1);

    // Open overlay directly in Global for SOLO
    setOverlayView("global");
    setShowOverlay(true);
  }

  return (
    <>
      <QuizPrototype
        roomCode={null}             // SOLO
        onFinish={onFinish}
        playerName={name || ""}     // let user type; stored under NAME_KEY by the quiz
        onOpenOverlayRequest={() => {
          // If they press «Δες κατάταξη» before finishing, still open global
          setOverlayView("global");
          setShowOverlay(true);
        }}
        startStage="name"
        onNameSaved={setName}          // start from Name stage
      />

      {showOverlay && (
        <ResultsOverlayV2
          onClose={() => setShowOverlay(false)}
          roomCode={null}                   // SOLO
          youId={userId}
          seedRow={mySeedRowRef.current}
          view={overlayView}
          onViewChange={(v) => setOverlayView(v)}
          refreshSignal={refreshTick}       // ← forces reload on fresh submission
        />
      )}
    </>
  );
}
