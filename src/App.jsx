// src/App.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { questions as DATA_QUESTIONS } from "./data/questions";
import ResultsTableResponsive from "./components/ResultsTableResponsive";

// Inputs & validation
import AutoCompleteAnswer from "./components/AutoCompleteAnswer";
import ScoreInput from "./components/ScoreInput";
import { validate as baseValidate } from "./lib/validators";
import { useMediaPrefetch } from "./hooks/useMediaPrefetch";

// Media & timers
import Media from "./components/Media";
import CountdownBar from "./components/CountdownBar";
import { QUIZ_ID } from "./lib/quizVersion";

/**
 * Football Quiz — SOLO MODE (single player)
 * Auto-marking:
 * - Catalogs (players/countries/coaches/teams/stadiums) → autocomplete + auto mark
 * - Scoreline → stepper input + auto mark
 * - Numeric → number input + auto mark
 * - Plain text ("text") → manual mark
 */

const SOLO = true;

// stable logo path (use the one that actually exists)
const LOGO_SRC = "/logo.png";

// Memoized logo so React won't re-render it unless props change
export const Logo = React.memo(function Logo({ className }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Λογότυπο"
      className={className || "h-7 w-auto"}
      draggable="false"
      decoding="async"
      loading="eager"
      fetchpriority="high"
      style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.4))" }}
    />
  );
});

// ——— Brand font wiring ———
const FONT_LINK_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Noto+Sans:wght@400;700&display=swap&subset=greek";

const FONT_FAMILIES = {
  display:
    '"Anton", "Noto Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  ui: '"Noto Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};



// ——— Game constants ———
// Namespace all client persistence by quiz version so flipping QUIZ_ID
// makes previous progress invisible to the new version.
const STORAGE_KEY = `quiz_prototype_state_v2_solo:${QUIZ_ID}`;
const STAGES = {
  NAME: "name",
  INTRO: "intro",
  CATEGORY: "category",
  QUESTION: "question",
  ANSWER: "answer",
  FINALE: "finale",
  RESULTS: "results",
};

// ——— NEW Timer constants / keys ———
const DEFAULT_QUESTION_SECONDS = 25;
const DEFAULT_CATEGORY_SECONDS = 20;
const DEFAULT_ANSWER_SECONDS = 10;
const GRACE_MS = 1000;
const CATEGORY_DEADLINE_KEY = `${STORAGE_KEY}:categoryDeadlineMs`;
const questionDeadlineKey = (i) => `${STORAGE_KEY}:questionDeadlineMs:${i}`;
const answerDeadlineKey = (i) => `${STORAGE_KEY}:answerDeadlineMs:${i}`;

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}
function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ——— Helpers for numeric validation (local) ———
function normalizeNumber(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}
async function validateAny(q, value) {
  const mode = q.answerMode || "text";
  if (mode === "numeric") {
    const got = normalizeNumber(
      typeof value === "object" && value !== null ? value.value ?? value : value
    );
    if (got === null) return { correct: false, canonical: null };
    const allowed =
      Array.isArray(q.acceptNumbers) && q.acceptNumbers.length
        ? q.acceptNumbers.map((x) => normalizeNumber(x)).filter((x) => x !== null)
        : [normalizeNumber(q.acceptNumber ?? q.answer)];
    const correct = allowed.includes(got);
    return { correct, canonical: String(got) };
  }
  return baseValidate(q, value);
}

export default function QuizPrototype({
  roomCode = null,
  startedAtOverride = null,
  onFinish = null,
  // NEW: playerName passed from page (Landing/PlayRoom/Solo)
  playerName = null,
  onOpenOverlayRequest = null,
  onNameSaved = null,
  startStage = "intro", // ← NEW: "intro" | "name"
  onNavigateHome = null,
}) {


  // ——— Load & order questions ———
  const QUESTIONS = useMemo(
    () => [...DATA_QUESTIONS].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    []
  );

  // ——— Category summary for Intro ———
  const CATEGORY_SUMMARY = useMemo(() => {
    const map = new Map();
    for (const q of QUESTIONS) {
      const key = q.category || "—";
      if (!map.has(key)) map.set(key, { category: key, points: new Set(), count: 0 });
      const e = map.get(key);
      e.points.add(q.points || 1);
      e.count += 1;
    }
    return Array.from(map.values()).map((e) => ({
      category: e.category,
      count: e.count,
      points: Array.from(e.points).sort((a, b) => a - b),
    }));
  }, [QUESTIONS]);

  // ——— Core game state ———
  const [index, setIndex] = usePersistentState(`${STORAGE_KEY}:index`, 0);

  // INITIAL STAGE: if we have a name from the page, start at INTRO; else ask for it
  const [stage, setStage] = usePersistentState(
    `${STORAGE_KEY}:stage`,
    startStage === "name" ? STAGES.NAME : STAGES.INTRO
  );

  const conn = typeof navigator !== "undefined" ? navigator.connection : null;
  const dynamicLookahead =
    (conn?.saveData || /2g|3g/.test(conn?.effectiveType || "")) ? 1 : 2;
  useMediaPrefetch(QUESTIONS, index, dynamicLookahead);

  const lastIndex = QUESTIONS.length - 1;
  const isFinalIndex = index === lastIndex;
  const q = QUESTIONS[index] ?? QUESTIONS[0];

  const finalCategoryName = useMemo(
    () => (QUESTIONS.length ? QUESTIONS[QUESTIONS.length - 1].category : null),
    [QUESTIONS]
  );

  const INTRO_CATEGORIES = useMemo(() => {
    return CATEGORY_SUMMARY.filter((c) => c.category !== finalCategoryName);
  }, [CATEGORY_SUMMARY, finalCategoryName]);

  const finalTopicLabel = useMemo(() => {
    const raw = finalCategoryName || "";
    return raw.replace(/^\s*Τελική\s+ερώτηση\s*[—–\-:]\s*/i, "").trim() || raw;
  }, [finalCategoryName]);

  // Safety: if persisted index is out-of-range
  useEffect(() => {
    if (index > lastIndex) setIndex(lastIndex < 0 ? 0 : lastIndex);
  }, [index, lastIndex, setIndex]);

  // ——— X2 help (single player) ———
  const [x2, setX2] = usePersistentState(`${STORAGE_KEY}:x2`, {
    p1: { available: true, armedIndex: null },
  });

  // Player
  const [p1, setP1] = usePersistentState(`${STORAGE_KEY}:p1`, {
    // seed from page when available
    name: playerName || "",
    score: 0,
    streak: 0,
    maxStreak: 0,
  });

  // keep name in sync if prop changes (e.g., auth hook updated)
  useEffect(() => {
    if (playerName && playerName.trim() && playerName !== p1.name) {
      setP1((s) => ({ ...s, name: playerName.trim().slice(0, 18) }));
    }
  }, [playerName]); // eslint-disable-line react-hooks/exhaustive-deps
  const NAME_KEY = "display_name_v1";

  const persistDisplayName = React.useCallback(
    (raw) => {
      const v = (raw ?? "").toString().trim().slice(0, 24);
      try {
        localStorage.setItem(NAME_KEY, v);
      } catch {}
      if (onNameSaved) onNameSaved(v);
    },
    [onNameSaved]
  );

  const didPersistNameRef = React.useRef(false);

  // If we somehow land on NAME with a known name, auto-skip to INTRO
  useEffect(() => {
    if (stage !== STAGES.NAME) return;

    // Prefer what the user typed on the Name stage; fall back to prop
    const typed = (p1?.name ?? "").trim();
    const passed = (playerName ?? "").trim();
    const effective = typed || passed;
    if (!effective) return;

    if (!didPersistNameRef.current) {
      persistDisplayName(effective); // save to localStorage + notify parent
      didPersistNameRef.current = true; // guard against double runs
    }
    setStage(STAGES.INTRO); // advance after persisting the name
  }, [stage, p1?.name, playerName, persistDisplayName, setStage]);

  const [lastCorrect, setLastCorrect] = usePersistentState(
    `${STORAGE_KEY}:lastCorrect`,
    null
  );

  // Marking status
  const [answered, setAnswered] = usePersistentState(
    `${STORAGE_KEY}:answered`,
    {}
  );

  // Finale wager
  const [wager, setWager] = usePersistentState(`${STORAGE_KEY}:wager`, { p1: 0 });
  const [finalResolved, setFinalResolved] = usePersistentState(
    `${STORAGE_KEY}:finalResolved`,
    { p1: false }
  );

  // Typed answers
  const [playerAnswers, setPlayerAnswers] = usePersistentState(
    `${STORAGE_KEY}:playerAnswers`,
    {}
  );

  // How-to
  const [showHowTo, setShowHowTo] = useState(false);
  const [introHowToShown, setIntroHowToShown] = useState(false); // per game

  // If we skipped NameStage straight to INTRO, still auto-open HowTo once
  useEffect(() => {
    if (stage === STAGES.INTRO && !introHowToShown) {
      setShowHowTo(true);
      setIntroHowToShown(true);
    }
  }, [stage, introHowToShown]);

  // Final question tip
  const [showFinalHowTo, setShowFinalHowTo] = useState(false);
  const [finalTipShown, setFinalTipShown] = useState(false);
  useEffect(() => {
    if (stage === STAGES.CATEGORY && isFinalIndex && !finalTipShown) {
      setShowFinalHowTo(true);
      setFinalTipShown(true);
    }
  }, [stage, isFinalIndex, finalTipShown]);

  // HUD flags
  const [justScored, setJustScored] = usePersistentState(
    `${STORAGE_KEY}:hud:justScored`,
    false
  );
  const [justLostStreak, setJustLostStreak] = usePersistentState(
    `${STORAGE_KEY}:hud:justLost`,
    false
  );
  useEffect(() => {
    if (justScored) {
      const t = setTimeout(() => setJustScored(false), 320);
      return () => clearTimeout(t);
    }
  }, [justScored, setJustScored]);
  useEffect(() => {
    if (justLostStreak) {
      const t = setTimeout(() => setJustLostStreak(false), 380);
      return () => clearTimeout(t);
    }
  }, [justLostStreak, setJustLostStreak]);

  // ——— Results reconstruction ———
  const RESULT_ROWS = useMemo(() => {
    if (!QUESTIONS.length) return [];
    const last = QUESTIONS.length - 1;

    let running = 0;
    let streak = 0;

    const rows = QUESTIONS.map((qi, i) => {
      const outcomeKey = answered[i];
      const isFinal = i === last;
      const base = qi.points || 1;
      const x2Applied = !isFinal && x2?.p1?.armedIndex === i;
      const userAnswer = (playerAnswers && playerAnswers[i]) || "";

      let delta = 0;
      let bonus = 0;
      let outcome = "—";

      if (isFinal) {
        if (outcomeKey === "final-correct") {
          outcome = "Σωστό";
          delta = wager?.p1 || 0;
        } else if (outcomeKey === "final-wrong") {
          outcome = "Λάθος";
          delta = -(wager?.p1 || 0);
        } else {
          outcome = "—";
        }
      } else {
        if (outcomeKey === "correct") {
          outcome = "Σωστό";
          streak = streak + 1;
          bonus = streak >= 3 ? 1 : 0;
          delta = base * (x2Applied ? 2 : 1) + bonus;
        } else if (outcomeKey === "wrong") {
          outcome = "Λάθος";
          streak = 0;
          delta = 0;
        } else {
          outcome = "—";
          streak = 0;
          delta = 0;
        }
      }

      running += delta;

      return {
        idx: i + 1,
        category: qi.category || "—",
        prompt: qi.prompt,
        base,
        x2Applied,
        bonus,
        outcome,
        userAnswer,
        delta,
        running,
        isFinal,
      };
    });

    return rows;
  }, [QUESTIONS, answered, x2, wager, playerAnswers]);

  // On entering Category: reset finale flags (per question)
  useEffect(() => {
    if (stage !== STAGES.CATEGORY) return;
    setFinalResolved({ p1: false });
    setWager({ p1: 0 });
  }, [stage, index]);

  // Aggregate modal flag for pausing timers
  const anyModalOpen = showHowTo || showFinalHowTo;

  // Clear Category deadline when leaving Category
  useEffect(() => {
    if (stage !== STAGES.CATEGORY) {
      try {
        localStorage.removeItem(CATEGORY_DEADLINE_KEY);
      } catch {}
    }
  }, [stage]);

  // NEW: Clear Answer deadline when leaving Answer
  useEffect(() => {
    if (stage !== STAGES.ANSWER) {
      try {
        localStorage.removeItem(answerDeadlineKey(index));
      } catch {}
    }
  }, [stage, index]);

  // X2 helpers
  function canArmX2(side) {
    const player = x2[side];
    return player?.available && !isFinalIndex && stage === STAGES.CATEGORY;
  }
  function armX2(side) {
    if (!canArmX2(side)) return;
    setX2((s) => ({
      ...s,
      [side]: { available: false, armedIndex: index },
    }));
  }
  function isX2ActiveFor(side) {
    const player = x2[side];
    return player?.armedIndex === index;
  }

  // Awarding
  function awardToP1(base = 1, { useMultiplier = true } = {}) {
    const baseMult =
      (q.points || 1) * (useMultiplier ? (isX2ActiveFor("p1") ? 2 : 1) : 1);
    const baseDelta = base * baseMult;

    setP1((s) => {
      const newStreak = lastCorrect === "p1" ? s.streak + 1 : 1;
      const streakBonus = newStreak >= 3 ? 1 : 0;
      return {
        ...s,
        score: s.score + baseDelta + streakBonus,
        streak: newStreak,
        maxStreak: Math.max(s.maxStreak, newStreak),
      };
    });
    setLastCorrect("p1");
    setJustScored(true);
    setJustLostStreak(false);
  }

  function noAnswer() {
    setLastCorrect(null);
    setP1((s) => {
      if (s.streak > 0) setJustLostStreak(true);
      return { ...s, streak: 0 };
    });
  }

  function finalizeOutcomeP1(outcome) {
    const bet = wager.p1;
    if (finalResolved.p1) return;
    if (outcome === "correct") {
      setP1((s) => ({ ...s, score: s.score + bet }));
    } else {
      setP1((s) => ({ ...s, score: s.score - bet }));
    }
    setFinalResolved({ p1: true });
    setAnswered((a) => ({
      ...a,
      [index]: outcome === "correct" ? "final-correct" : "final-wrong",
    }));
  }

  function next() {
    if (stage === STAGES.NAME) {
      setIndex(0);
      setStage(STAGES.INTRO);
    } else if (stage === STAGES.INTRO) {
      setIndex(0);
      setStage(STAGES.CATEGORY);
    } else if (stage === STAGES.CATEGORY) setStage(STAGES.QUESTION);
    else if (stage === STAGES.FINALE) setStage(STAGES.QUESTION);
    else if (stage === STAGES.QUESTION) setStage(STAGES.ANSWER);
    else if (stage === STAGES.ANSWER) {
      if (index < lastIndex) {
        setIndex((i) => i + 1);
        setStage(STAGES.CATEGORY);
      } else setStage(STAGES.RESULTS);
    }
  }
  function previous() {
    if (stage === STAGES.QUESTION) setStage(STAGES.CATEGORY);
    else if (stage === STAGES.ANSWER) setStage(STAGES.QUESTION);
    else if (stage === STAGES.FINALE) setStage(STAGES.CATEGORY);
    else if (stage === STAGES.RESULTS) setStage(STAGES.ANSWER);
    else if (stage === STAGES.CATEGORY) {
      if (index > 0) {
        setIndex((i) => i - 1);
        setStage(STAGES.ANSWER);
      } else {
        setStage(STAGES.INTRO);
      }
    }
  }

  function resetGame() {
    setIndex(0);
    // Go to INTRO if we have a name (from prop or saved), else ask for it
    setStage(p1.name || playerName ? STAGES.INTRO : STAGES.NAME);
    setP1({ name: p1.name, score: 0, streak: 0, maxStreak: 0 });
    setWager({ p1: 0 });
    setFinalResolved({ p1: false });
    setLastCorrect(null);
    setX2({ p1: { available: true, armedIndex: null } });
    setAnswered({});
    setPlayerAnswers({});
    setIntroHowToShown(false);
    setFinalTipShown(false);
    try {
      localStorage.removeItem(CATEGORY_DEADLINE_KEY);
      for (let i = 0; i < QUESTIONS.length; i++) {
        localStorage.removeItem(questionDeadlineKey(i));
        localStorage.removeItem(answerDeadlineKey(i));
      }
    } catch {}
    // keep startedAt as-is; it will be set again when INTRO is reached
  }

  async function exportShareCard() {
    const w = 1080,
      h = 1350;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, THEME.gradientFrom);
    g.addColorStop(1, THEME.gradientTo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `800 64px Inter, Noto Sans, system-ui, sans-serif`;
    ctx.fillText("Ποδοσφαιρικό Κουίζ — Αποτελέσματα Σόλο", w / 2, 140);
    ctx.font = `700 52px Inter, Noto Sans, system-ui, sans-serif`;
    ctx.fillText(`${p1.name}: ${p1.score}`, w / 2, 300);
    ctx.font = `800 76px Inter, Noto Sans, system-ui, sans-serif`;
    ctx.fillText(`Τελικό σκορ: ${p1.score}`, w / 2, 520);
    ctx.font = `600 42px Inter, Noto Sans, system-ui, sans-serif`;
    ctx.fillText(`Μεγαλύτερο σερί — ${p1.maxStreak}`, w / 2, 680);
    ctx.font = `500 30px Inter, Noto Sans, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("onlyfootballfans • σόλο παιχνίδι", w / 2, h - 80);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "quiz-results.png";
    a.click();
  }

  // ——— Multiplayer timing support ———
  const [startedAt, setStartedAt] = usePersistentState(
    `${STORAGE_KEY}:startedAt`,
    null
  );

  // Prefer broadcasted start time if provided (multiplayer)
  useEffect(() => {
    if (startedAtOverride && !startedAt) setStartedAt(startedAtOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtOverride]);

  // In solo mode, set startedAt when the user first lands on INTRO
  useEffect(() => {
    if (stage === STAGES.INTRO && !startedAt) setStartedAt(Date.now());
  }, [stage, startedAt, setStartedAt]);

  // Fire onFinish exactly once when entering RESULTS (multiplayer integration)
  const finishFiredRef = useRef(false);
  useEffect(() => {
    if (stage === STAGES.RESULTS && onFinish && !finishFiredRef.current) {
      finishFiredRef.current = true;
      const durSec = startedAt
        ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
        : 0;
      try {
        // Convert RESULT_ROWS to the shape expected by the overlay.
        const resultRows = RESULT_ROWS.map((r) => ({
          i: r.idx,
          category: r.category,
          points: r.base,
          isFinal: r.isFinal,
          correct:
            r.outcome === "Σωστό" ? true : r.outcome === "Λάθος" ? false : null,
          x2: r.x2Applied,
          answerText: r.userAnswer,
          answerSide: null,
          delta: r.delta,
          total: r.running,
          streakPoints: r.bonus,
        }));
        onFinish({
          score: p1.score,
          maxStreak: p1.maxStreak,
          durationSeconds: durSec,
          roomCode,
          resultRows,
        });
      } catch {
        /* silently ignore */
      }
    }
  }, [stage, onFinish, p1.score, p1.maxStreak, startedAt, roomCode, RESULT_ROWS]);

  // ——— UI subcomponents ———
  function HUDHeader({
    stage,
    current,
    total,
    score,
    streak,
    justScored,
    justLostStreak,
  }) {
    const isPreGame = stage === STAGES.NAME || stage === STAGES.INTRO;
    const shownCurrent = isPreGame ? 0 : current + 1;
    const pct = total > 0 ? (shownCurrent / total) * 100 : 0;

    const progressText = isPreGame ? "Έναρξη" : `Ερ. ${current + 1} από ${total}`;
    const ariaText = isPreGame
      ? `Έναρξη — ${total} ερωτήσεις`
      : `Ερώτηση ${current + 1} από ${total}`;

    return (
      <div className="px-3 pt-4">
        <div className="sticky top-0 z-40">
          <div
            className="mx-auto max-w-4xl rounded-2xl backdrop-blur px-4 py-3 shadow-lg bg-white border border-slate-200"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: Progress */}
              <div className="min-w-0 sm:flex-1">
                <div
                  className="text-sm font-semibold text-text"
                  aria-label={ariaText}
                >
                  {progressText}
                </div>
                <div
                  className="mt-1 h-2 w-full rounded-full overflow-hidden bg-slate-200"
                  role="progressbar"
                  aria-valuenow={shownCurrent}
                  aria-valuemin={0}
                  aria-valuemax={total}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Right: Score & Streak */}
              <div className="flex items-end justify-between gap-8 sm:justify-end">
                <div
                  className={`text-right ${justScored ? "hud-score-pop" : ""}`}
                  aria-label={`Σκορ ${score}`}
                >
                  <div className="text-xs uppercase tracking-wide text-text">
                    Σκορ
                  </div>
                  <div className="text-2xl md:text-3xl font-extrabold text-text">
                    {score}
                  </div>
                </div>

                {streak > 0 && !isPreGame && (
                  <div
                    className={`text-right ${
                      justLostStreak ? "hud-streak-shake" : "hud-streak-pulse"
                    }`}
                    aria-label={`ΣΕΡΙ ${streak}`}
                  >
                    <div className="text-xs uppercase tracking-wide text-text">
                      ΣΕΡΙ
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-base">🔥</span>
                      <span className="text-lg font-bold text-text">
                        {streak}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StageCard({ children, variant = "default" }) {
    // We use `bg-white` for the card surface to contrast with the main `bg-background`.
    // Text color will inherit from the root `color: theme('colors.text')` set in index.css.
    const baseClasses = "p-6 rounded-lg shadow-lg bg-white";
    return <div className={baseClasses}>{children}</div>;
  }

  // ——— Name Stage ———
  function NameStage() {
    const [tempName, setTempName] = useState(p1.name || "");
    const canProceed = tempName.trim().length >= 2;

    // Auto-open HowTo once at start (now on NAME stage, not INTRO)
    useEffect(() => {
      if (!introHowToShown) {
        setShowHowTo(true);
        setIntroHowToShown(true);
      }
    }, []); // runs once when NameStage mounts

    return (
      <StageCard>
        <Logo className="mx-auto h-32 w-auto mb-8" />
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-text">Καλώς ήρθες!</h1>
          <p className="mt-2 font-ui text-slate-500">
            Γράψε το όνομά σου — θα εμφανίζεται στο σκορ και στα αποτελέσματα.
          </p>

          {/* Οδηγίες button here (start of game) */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setShowHowTo(true)}
              className="rounded-full bg-slate-200 text-text px-4 py-2 text-sm font-semibold"
            >
              🇬🇷 Οδηγίες
            </button>
          </div>
        </div>

        <div className="mt-5 max-w-md mx-auto">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              👤
            </span>
            <input
              className="w-full rounded-lg px-3 py-3 pl-9 outline-none bg-slate-100 text-text border border-slate-300 focus:ring-2 focus:ring-primary"
              placeholder="π.χ. Goat"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              maxLength={18}
              autoFocus
            />
          </div>

          <div className="mt-5 flex justify-center">
            <button
              className="btn btn-accent"
              onClick={() => {
                const v = tempName.trim();
                setP1((s) => ({ ...s, name: v }));
                // persist to localStorage + notify parent BEFORE leaving NAME stage
                persistDisplayName(v);
                didPersistNameRef.current = true; // avoid double-persist from the effect
                setStage(STAGES.INTRO);
              }}
              disabled={!canProceed}
            >
              Προχώρα
            </button>
          </div>
        </div>
      </StageCard>
    );
  }

  // ——— Intro Stage ———
  function IntroStage({ onNavigateHome }) {
    const formatPoints = (ptsArr = []) => {
      const pts = [...ptsArr].sort((a, b) => a - b);
      if (pts.length <= 1) return `×${pts[0] ?? 1}`;
      if (pts.length === 2) return `×${pts[0]} / ×${pts[1]}`;
      return `×${pts[0]}–×${pts[pts.length - 1]}`;
    };

    return (
      <StageCard>
        <div className="flex items-center justify-between py-4 px-4">
          <Logo className="h-32 w-auto" />
          <button
            onClick={() => setShowHowTo(true)}
            className="rounded-full bg-slate-200 text-text px-4 py-2 text-sm font-semibold"
          >
            Πώς παίζεται
          </button>
        </div>
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-text">
            Ποδοσφαιρικό Κουίζ
          </h1>
          <p className="mt-2 font-ui text-slate-500">
            Δες τις κατηγορίες και πάτα «Ας παίξουμε» για να ξεκινήσεις.
          </p>
        </div>

        <div className="mt-6 rounded-2xl bg-gray-800 border border-slate-200">
          <ul className="divide-y divide-slate-200">
            {INTRO_CATEGORIES.map((c) => (
              <li
                key={c.category}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold text-orange-500">
                    {c.category}
                  </div>
                  {c.count > 1 && (
                    <div className="text-xs mt-0.5 text-slate-500">
                      x{c.count} ερωτήσεις
                    </div>
                  )}
                </div>
                <span
                  className="rounded-full bg-slate-200 text-gray-800 px-3 py-1 text-xs font-bold"
                >
                  {formatPoints(c.points)}
                </span>
              </li>
            ))}

            {finalCategoryName && (
              <li className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold text-orange-500">
                    Τελική ερώτηση — {finalTopicLabel}
                  </div>
                  <div className="text-xs mt-0.5 text-slate-500">στοίχημα 0×–3×</div>
                </div>
                <span
                  className="rounded-full bg-slate-200 text-gray-800 px-3 py-1 text-xs font-bold"
                >
                  0×–3×
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="mt-6 flex justify-between">
          {onNavigateHome && (
            <button
              onClick={() => onNavigateHome('/')}
              className="btn bg-primary text-white"
            >
              Αρχική
            </button>
          )}
          <button onClick={next} className="btn btn-accent">
            Ας παίξουμε
          </button>
        </div>
      </StageCard>
    );
  }

  function CategoryStage() {
    const points = q.points || 1;

    // Optional hidden override (host-only later)
    const [categorySecondsOverride, setCategorySecondsOverride] = useState(null);
    const categorySeconds =
      categorySecondsOverride ?? DEFAULT_CATEGORY_SECONDS;

    const [catDeadline, setCatDeadline] = useState(() => {
      const raw = Number(localStorage.getItem(CATEGORY_DEADLINE_KEY));
      return Number.isFinite(raw) ? raw : null;
    });

    // (Re)arm deadline on entering Category (or index change)
    useEffect(() => {
      if (stage !== STAGES.CATEGORY) return;
      const now = Date.now();
      let dl = Number(localStorage.getItem(CATEGORY_DEADLINE_KEY));
      if (!Number.isFinite(dl) || dl <= now) {
        dl = now + categorySeconds * 1000 + GRACE_MS;
        try {
          localStorage.setItem(CATEGORY_DEADLINE_KEY, String(dl));
        } catch {}
      }
      setCatDeadline(dl);
    }, [stage, index, categorySeconds]);

    return (
      <StageCard>
        <div className="flex justify-center mb-4">
          <img src={LOGO_SRC} alt="Logo" className="h-24 w-auto" />
        </div>

        {/* Hidden override control for now */}
        <div className="hidden mt-2">
          <label className="text-xs mr-2 text-slate-500">Χρόνος κατηγορίας</label>
          <select
            className="rounded text-xs px-2 py-1 bg-slate-100 text-text"
            value={categorySeconds}
            onChange={(e) =>
              setCategorySecondsOverride(Number(e.target.value))
            }
          >
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={20}>20s</option>
            <option value={25}>25s</option>
            <option value={30}>30s</option>
          </select>
        </div>

        {/* Title */}
        <h2 className="mt-4 text-center text-3xl font-extrabold tracking-wide font-display" style={{ color: 'var(--primary-color)' }}>
          {q.category}
        </h2>

        {/* Compact chips row: points (no-wrap) + small X2 chip */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap text-white"
            style={{ backgroundColor: 'var(--accent-color)' }}
            aria-label={`${points} πόντοι`}
          >
            ×{points}
          </span>

          {/* X2 chip (hidden on final) */}
          {!isFinalIndex && (
            <X2Control
              side="p1"
              armed={isX2ActiveFor("p1")}
              available={x2.p1.available}
              onArm={() => armX2("p1")}
              isFinal={isFinalIndex}
              stage={stage}
              variant="chip" // compact chip presentation
            />
          )}
        </div>

        {/* Tiny helper caption (optional) */}
        {!isFinalIndex && (
          <div className="mt-1 text-center text-xs font-ui text-slate-500">
            X2: μία φορά ανά παιχνίδι
          </div>
        )}

        {/* Final betting UI on last question */}
        {isFinalIndex && (
          <div className="mt-6 rounded-2xl p-4 bg-slate-50 border border-slate-200">
            <div className="mb-2 text-center text-sm font-ui text-slate-500">
              Τελικός — Τοποθέτησε το ποντάρισμά σου (0–3) και πάτησε Επόμενο.
            </div>
            <div className="max-w-2xl mx-auto flex justify-center">
              <WagerControl
                label={p1.name}
                value={wager.p1}
                onChange={(n) => setWager({ p1: clamp(n, 0, 3) })}
              />
            </div>
          </div>
        )}

        {/* Category countdown */}
        {catDeadline && (
          <CountdownBar
            totalMs={categorySeconds * 1000}
            deadlineMs={catDeadline}
            paused={anyModalOpen}
            label="Χρόνος"
            persistKey={CATEGORY_DEADLINE_KEY}
            onDeadlineChange={setCatDeadline}
            onExpire={() => {
              try {
                localStorage.removeItem(CATEGORY_DEADLINE_KEY);
              } catch {}
              setStage(STAGES.QUESTION);
            }}
          />
        )}

        <div className="mt-6 flex justify-center gap-3">
          <NavButtons />
        </div>
      </StageCard>
    );
  }

  function QuestionStage() {
    const mode = q.answerMode || "text";
    const questionSeconds = q.time_seconds ?? DEFAULT_QUESTION_SECONDS;

    // Local state for CATALOG
    const [catPicked, setCatPicked] = useState(null);
    const [catText, setCatText] = useState("");

    // Local state for TEXT/NUMERIC
    const [inputValue, setInputValue] = useState(
      () => playerAnswers[index] ?? ""
    );

    // Local state for SCORELINE
    const [scoreValue, setScoreValue] = useState(() =>
      typeof playerAnswers[index] === "object" &&
      playerAnswers[index] !== null
        ? playerAnswers[index]
        : { home: 0, away: 0 }
    );

    // Media readiness (to start timer after media is ready; else fallback grace)
    const [mediaReady, setMediaReady] = useState(false);

    // When the question changes, determine if media is ready.
    // If there's no media, it's ready instantly.
    // If there IS media, we reset the flag and wait for the Media component's onReady.
    useEffect(() => {
      setMediaReady(false); // Reset on each question
      if (q && !q.media) {
        setMediaReady(true);
      }
    }, [q.id]); // Re-run when question changes

    // Per-question absolute deadline
    const [qDeadline, setQDeadline] = useState(() => {
      const raw = Number(localStorage.getItem(questionDeadlineKey(index)));
      // Only use stored deadline if it's in the future
      if (Number.isFinite(raw) && raw > Date.now()) {
        return raw;
      }
      return null;
    });

    useEffect(() => {
      setInputValue(playerAnswers[index] ?? "");
      setScoreValue(
        typeof playerAnswers[index] === "object" &&
          playerAnswers[index] !== null
          ? playerAnswers[index]
          : { home: 0, away: 0 }
      );
      setCatPicked(null);
      setCatText("");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index]);

    // (Re)arm question deadline when entering QUESTION. The timer will be PAUSED
    // until the media is ready.
    useEffect(() => {
      if (stage !== STAGES.QUESTION) return;
      const key = questionDeadlineKey(index);
      const now = Date.now();

      // Do we have a valid, future deadline stored?
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored) && stored > now) {
        setQDeadline(stored);
        return; // Use stored deadline
      }

      // Otherwise, set a new deadline immediately.
      const dl = now + questionSeconds * 1000 + GRACE_MS;
      setQDeadline(dl);
      try {
        localStorage.setItem(key, String(dl));
      } catch {}
    }, [stage, index, questionSeconds]);

    // Replace the whole submitAndReveal with this version:
    const submitAndReveal = async (value) => {
      let stored;
      if (mode === "scoreline") {
        stored = value;
      } else if (mode === "numeric") {
        if (value === "" || value === null || value === undefined) {
          stored = { value: null };
        } else {
          const n = Number(value);
          stored = { value: Number.isFinite(n) ? n : null };
        }
      } else {
        stored = value;
      }

      // Persist what the player entered (even if blank)
      setPlayerAnswers((prev) => ({
        ...prev,
        [index]:
          typeof stored === "object" && stored?.name ? stored.name : stored,
      }));

      // Detect explicit "I don't know" for auto-marking modes and mark as wrong immediately
      const isAutoMode = mode !== "text";
      const isIDontKnow =
        (mode === "numeric" && (stored == null || stored.value == null)) ||
        (mode === "scoreline" && stored === "") ||
        (mode === "catalog" &&
          (!stored || (typeof stored === "string" && stored.trim() === "")));

      if (isAutoMode && isIDontKnow) {
        if (!isFinalIndex) {
          // instant wrong + reset streak
          setAnswered((a) => ({ ...a, [index]: "wrong" }));
          noAnswer();
        } else {
          // final question: apply loss immediately
          finalizeOutcomeP1("wrong");
        }
        setStage(STAGES.ANSWER);
        // Clear deadline for this question (prevent re-fire on refresh)
        try {
          localStorage.removeItem(questionDeadlineKey(index));
        } catch {}
        setQDeadline(null);
        return; // skip validation
      }

      // Otherwise, keep existing behavior
      setStage(STAGES.ANSWER);

      // Clear deadline now that answer stage is entered
      try {
        localStorage.removeItem(questionDeadlineKey(index));
      } catch {}
      setQDeadline(null);

      if (isAutoMode) {
        const result = await validateAny(q, stored?.name ? stored : stored);
        if (!isFinalIndex) {
          setAnswered((a) => ({
            ...a,
            [index]: result.correct ? "correct" : "wrong",
          }));
          if (result.correct) awardToP1(1);
          else noAnswer();
        } else {
          finalizeOutcomeP1(result.correct ? "correct" : "wrong");
        }
      }
    };

    return (
      <StageCard>
        <div className="flex justify-center mb-4">
          <Logo className="h-24 w-auto" />
        </div>
        <div className="flex items-center gap-2">
            <div className="rounded-full px-3 py-1 text-xs font-semibold bg-slate-200 text-text">
              {isFinalIndex ? "Τελικός 0×–3×" : `Κατηγορία ×${q.points || 1}`}
            </div>
            {isX2ActiveFor("p1") && !isFinalIndex && (
              <div
                className="rounded-full px-3 py-1 text-xs font-semibold bg-primary text-white"
                title="Χ2 ενεργό"
              >
                ×2
              </div>
            )}
          </div>

        <h3 className="mt-4 font-display text-2xl font-bold leading-snug text-text">
          {q.prompt}
        </h3>

        {/* Media */}
        <div className="mt-4">
          <Media
            media={{ ...q.media, priority: true }}
            onReady={() => setMediaReady(true)}
          />
        </div>

        {/* Question countdown */}
        {qDeadline && (
          <CountdownBar
            totalMs={questionSeconds * 1000}
            deadlineMs={qDeadline}
            paused={anyModalOpen || !mediaReady} // ← Pause until media is ready
            label="Χρόνος"
            persistKey={questionDeadlineKey(index)}
            onDeadlineChange={setQDeadline}
            onExpire={() => {
              // Auto-submit "Δεν γνωρίζω"
              submitAndReveal("");
            }}
          />
        )}

        {/* CATALOG */}
        {mode === "catalog" && (
          <div className="mt-5">
            <AutoCompleteAnswer
              catalog={q.catalog}
              placeholder="Άρχισε να πληκτρολογείς…"
              onSelect={(item) => setCatPicked(item)}
              onChangeText={(t) => setCatText(t)}
            />
            <div className="flex flex-wrap gap-3 justify-center mt-3">
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  const toSubmit =
                    catPicked && catPicked.name ? catPicked : catText;
                  submitAndReveal(toSubmit);
                }}
                disabled={
                  !(
                    (catPicked && catPicked.name) ||
                    (catText && catText.trim().length > 0)
                  )
                }
              >
                Υποβολή
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => submitAndReveal("")}
              >
                Δεν γνωρίζω
              </button>
            </div>
          </div>
        )}

        {/* SCORELINE */}
        {mode === "scoreline" && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <ScoreInput value={scoreValue} onChange={(v) => setScoreValue(v)} />
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => submitAndReveal(scoreValue)}
              >
                Υποβολή σκορ
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => submitAndReveal("")}
              >
                Δεν γνωρίζω
              </button>
            </div>
          </div>
        )}

        {/* NUMERIC */}
        {mode === "numeric" && (
          <form
            className="mt-5 flex flex-col items-stretch gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitAndReveal(inputValue);
            }}
          >
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-lg px-4 py-3 outline-none bg-slate-100 text-text border border-slate-300 focus:ring-2 focus:ring-primary"
              placeholder="Πληκτρολόγησε αριθμό…"
              value={inputValue ?? ""}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <div className="flex flex-wrap gap-3 justify-center">
              <button type="submit" className="btn btn-accent">
                Υποβολή
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => submitAndReveal("")}
              >
                Δεν γνωρίζω
              </button>
            </div>
          </form>
        )}

        {/* TEXT */}
        {mode === "text" && (
          <form
            className="mt-5 flex flex-col items-stretch gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitAndReveal(inputValue);
            }}
          >
            <input
              className="w-full rounded-lg px-4 py-3 outline-none bg-slate-100 text-text border border-slate-300 focus:ring-2 focus:ring-primary"
              placeholder="Γράψε την απάντησή σου…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-3 justify-center">
              <button type="submit" className="btn btn-accent">
                Υποβολή
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => submitAndReveal("")}
                title="Μετάβαση στην απάντηση χωρίς να δοθεί λύση"
              >
                Δεν γνωρίζω
              </button>
            </div>
          </form>
        )}
      </StageCard>
    );
  }

  function AnswerStage() {
    const mode = q.answerMode || "text";
    const rawUser = (playerAnswers && playerAnswers[index]) ?? "";

    // NEW: Answer timer
    const answerSeconds = DEFAULT_ANSWER_SECONDS;
    const [answerDeadline, setAnswerDeadline] = useState(() => {
      const raw = Number(localStorage.getItem(answerDeadlineKey(index)));
      return Number.isFinite(raw) ? raw : null;
    });

    useEffect(() => {
      if (stage !== STAGES.ANSWER || isFinalIndex) return;
      const key = answerDeadlineKey(index);
      const now = Date.now();
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored) && stored > now) {
        setAnswerDeadline(stored);
        return;
      }
      const dl = now + answerSeconds * 1000 + GRACE_MS;
      setAnswerDeadline(dl);
      try {
        localStorage.setItem(key, String(dl));
      } catch {}
    }, [stage, index, isFinalIndex, answerSeconds]);

    let userAnswerStr = "—";
    if (mode === "scoreline" && rawUser && typeof rawUser === "object") {
      userAnswerStr = `${rawUser.home ?? 0} - ${rawUser.away ?? 0}`;
    } else if (mode === "numeric" && rawUser && typeof rawUser === "object") {
      userAnswerStr = rawUser.value != null ? String(rawUser.value) : "—";
    } else {
      userAnswerStr = rawUser ? String(rawUser) : "—";
    }

    const outcomeKey = answered[index];
    const currentRow = RESULT_ROWS[index] || null;
    const isCorrect = outcomeKey === "correct" || outcomeKey === "final-correct";
    const isWrong = outcomeKey === "wrong" || outcomeKey === "final-wrong";
    const deltaPts = currentRow ? currentRow.delta : 0;

    const outcomeBg = isCorrect
      ? "bg-green-100 border-green-200"
      : isWrong
      ? "bg-red-100 border-red-200"
      : "bg-slate-100 border-slate-200";

    const outcomePillBg = isCorrect ? "bg-green-500" : "bg-red-500";

    return (
      <StageCard>
        {/* Header: show logo on the left; optional chip on the right */}
        <div className="flex justify-center mb-4">
          <Logo className="h-24 w-auto" />
        </div>
        <div className="flex items-center justify-between">
          <div className="rounded-full px-3 py-1 text-xs font-semibold bg-slate-200 text-text">
            {isFinalIndex ? "Τελικός 0×–3×" : `Κατηγορία ×${q.points || 1}`}
          </div>
        </div>

        <div className="text-center mt-4">
          <div className="font-display text-3xl font-extrabold text-text">{q.answer}</div>

        <div className="mt-3 font-ui text-sm">
            <div
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 border ${outcomeBg}`}
            >
              <span className="opacity-80 text-black">Player Answer:</span>
              <span className="italic text-text">{userAnswerStr}</span>

              {(isCorrect || isWrong) && (
                <span
                  className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${outcomePillBg}`}
                  title={isCorrect ? "Σωστό" : "Λάθος"}
                >
                  {isCorrect ? "✔" : "✘"}{" "}
                  {deltaPts >= 0 ? `+${deltaPts}` : `${deltaPts}`}
                </span>
              )}
            </div>
          </div>

          {/* fact */}
          {q.fact && (
            <div className="mt-2 font-ui text-sm text-slate-500">ℹ️ {q.fact}</div>
          )}
        </div>

        {/* Answer countdown (not on final) */}
        {!isFinalIndex && answerDeadline && (
          <CountdownBar
            totalMs={answerSeconds * 1000}
            deadlineMs={answerDeadline}
            paused={anyModalOpen}
            label="Επόμενη ερώτηση σε"
            persistKey={answerDeadlineKey(index)}
            onDeadlineChange={setAnswerDeadline}
            onExpire={() => {
              // Auto-progress to next question
              next();
            }}
          />
        )}

        <div className="mt-3 text-center text-xs font-ui text-slate-500">
          {isX2ActiveFor("p1") && !isFinalIndex && <span>(×2 ενεργό)</span>}
        </div>

        {/* Manual awarding controls (only for text mode) */}
        {!isFinalIndex && mode === "text" && (
          <div className="mt-6 flex flex-col items-center gap-3 font-ui">
            <div className="flex flex-wrap justify-center gap-2">
              <button
                className="btn btn-accent"
                onClick={() => {
                  awardToP1(1);
                  setAnswered((a) => ({ ...a, [index]: "correct" }));
                  next();
                }}
                title="Σωστό"
              >
                Σωστό
              </button>
              <button
                className="btn btn-neutral"
                onClick={() => {
                  noAnswer();
                  setAnswered((a) => ({ ...a, [index]: "wrong" }));
                  next();
                }}
                title="Λάθος / Καμία απάντηση — μηδενίζει το σερί"
              >
                Λάθος / Καμία απάντηση
              </button>
            </div>
          </div>
        )}

        {/* Final scoring controls on last question (text mode only) */}
        {isFinalIndex && mode === "text" && (
          <div className="card font-ui mt-6 text-center">
            <div className="mb-2 text-sm text-slate-500">
              Τελικός — Απονέμονται πόντοι βάσει πονταρίσματος
            </div>
            <div className="text-xs mb-3 text-slate-500">
              Το Χ2 δεν ισχύει στον Τελικό.
            </div>
            <div className="space-y-2">
              <div className="text-sm text-slate-500">{p1.name}</div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  disabled={finalResolved.p1}
                  onClick={() => {
                    finalizeOutcomeP1("correct");
                    next();
                  }}
                  className="btn btn-accent disabled:opacity-50"
                >
                  Σωστό +{wager.p1}
                </button>
                <button
                  disabled={finalResolved.p1}
                  onClick={() => {
                    finalizeOutcomeP1("wrong");
                    next();
                  }}
                  className="btn btn-neutral disabled:opacity-50"
                >
                  Λάθος −{wager.p1}
                </button>
                {finalResolved.p1 && (
                  <span className="text-xs text-primary">Ολοκληρώθηκε ✔</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <NavButtons />
        </div>
      </StageCard>
    );
  }

  function ResultsStage() {
    const rows = useMemo(
      () =>
        RESULT_ROWS.map((r) => ({
          i: r.idx,
          category: r.category,
          points: r.base ?? 0,
          isFinal: r.isFinal,
          correct:
            r.outcome === "Σωστό" ? true : r.outcome === "Λάθος" ? false : null,
          x2: !!r.x2Applied,
          answerText:
            typeof r.userAnswer === "object" && r.userAnswer
              ? r.userAnswer.home != null && r.userAnswer.away != null
                ? `${r.userAnswer.home} - ${r.userAnswer.away}`
                : r.userAnswer.value != null
                ? String(r.userAnswer.value)
                : ""
              : r.userAnswer || "",
          streakPoints: !r.isFinal && r.bonus ? 1 : 0,
          delta: r.delta,
          total: r.running,
        })),
      [RESULT_ROWS]
    );

    return (
      <>
        <ResultsTableResponsive
          rows={rows}
          title="Αποτελέσματα"
          playerName={p1.name}
          totalScore={p1.score}
          maxStreak={p1.maxStreak}
          onReset={resetGame}
          lang="el"
        />
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="btn btn-accent px-6 py-3"
            onClick={() => onOpenOverlayRequest && onOpenOverlayRequest()}
          >
            Δες Κατάταξη
          </button>
        </div>
      </>
    );
  }

  function X2Control({
    label,
    side,
    available,
    armed,
    onArm,
    isFinal,
    stage,
    variant = "card",
  }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const clickable =
      available && !isFinal && stage === STAGES.CATEGORY && !armed;

    function handlePrimaryClick() {
      if (!clickable) return;
      setConfirmOpen(true);
    }
    function confirmArm() {
      setConfirmOpen(false);
      onArm();
    }

    const statusText = (() => {
      if (isFinal) return "Δεν επιτρέπεται στον Τελικό.";
      if (armed) return "Χ2 ενεργό για αυτή την ερώτηση.";
      if (!available) return "Χ2 χρησιμοποιήθηκε.";
      return "Μπορεί να χρησιμοποιηθεί μόνο μία φορά.";
    })();

    // --- New compact CHIP variant ---
    if (variant === "chip") {
      const chipText = isFinal
        ? "Χ2 δεν επιτρέπεται"
        : armed
        ? "⚡ Χ2 ενεργό"
        : available
        ? "⚡ Ενεργοποίηση Χ2"
        : "Χ2 χρησιμοποιήθηκε";

      const baseChip = "rounded-full select-none text-xs font-bold px-3 py-1.5";
      const activeChip = `${baseChip} bg-accent text-white cursor-pointer`;
      const armedChip = `${baseChip} bg-accent text-white animate-pulse`;
      const disabledChip = `${baseChip} bg-slate-200 text-slate-500 cursor-not-allowed`;

      const chipClass = clickable ? activeChip : armed ? armedChip : disabledChip;

      return (
        <div className="relative inline-block">
          <button
            type="button"
            className={chipClass}
            onClick={handlePrimaryClick}
            disabled={!clickable}
            aria-disabled={!clickable}
            aria-label="Ενεργοποίηση Χ2"
            style={clickable ? { backgroundColor: 'var(--accent-color)' } : {}}
          >
            {chipText}
          </button>

          {/* Inline confirm popover */}
          {confirmOpen && (
            <div
              className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[min(92vw,320px)] rounded-xl p-3 shadow-xl z-10 bg-white border border-slate-200"
              role="dialog"
              aria-modal="true"
              aria-label="Επιβεβαίωση Χ2"
            >
              <div className="text-sm font-semibold mb-1 text-text">
                Ενεργοποίηση Χ2;
              </div>
              <div className="text-xs mb-3 text-slate-500">
                Θα διπλασιάσει τους πόντους αυτής της ερώτησης. Συνέχεια;
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="btn btn-neutral"
                  onClick={() => setConfirmOpen(false)}
                >
                  Άκυρο
                </button>
                <button className="btn btn-accent" onClick={confirmArm} style={{ backgroundColor: 'var(--accent-color)' }}>
                  Ναι, ενεργοποίηση
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // --- Original CARD variant (kept for backward-compat) ---
    return (
      <div className="card font-ui mx-auto text-center relative">
        {label ? (
          <div className="mb-3 text-sm text-slate-500">{label}</div>
        ) : null}

        <button
          className={[
            "rounded-full px-5 py-2.5 font-extrabold shadow transition",
            clickable
              ? "bg-accent text-white hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-orange-400"
              : "bg-slate-200 text-slate-500 opacity-60 cursor-not-allowed",
          ].join(" ")}
          onClick={handlePrimaryClick}
          disabled={!clickable}
          aria-disabled={!clickable}
          aria-label="Ενεργοποίηση Χ2"
        >
          {armed ? "Χ2 ενεργό" : "⚡ Ενεργοποίηση Χ2"}
        </button>

        <div className="mt-2 text-xs text-slate-500">{statusText}</div>

        {confirmOpen && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[min(92vw,320px)] rounded-xl p-3 shadow-xl bg-white border border-slate-200"
            role="dialog"
            aria-modal="true"
            aria-label="Επιβεβαίωση Χ2"
          >
            <div className="text-sm font-semibold mb-1 text-text">
              Ενεργοποίηση Χ2;
            </div>
            <div className="text-xs mb-3 text-slate-500">
              Θα διπλασιάσει τους πόντους αυτής της ερώτησης. Συνέχεια;
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-neutral"
                onClick={() => setConfirmOpen(false)}
              >
                Άκυρο
              </button>
              <button className="btn btn-accent" onClick={confirmArm} style={{ backgroundColor: 'var(--accent-color)' }}>
                Ναι, ενεργοποίηση
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function WagerControl({ label, value, onChange }) {
    return (
      <div className="card font-ui text-center flex flex-col items-center">
        <div className="mb-3 text-sm text-slate-500">{label}</div>
        <div className="flex items-center gap-2 justify-center">
          <button className="btn btn-neutral" onClick={() => onChange(value - 1)}>
            −
          </button>
          <div
            className="rounded-full text-white text-xl px-5 py-2 bg-primary"
          >
            {value}
          </div>
          <button className="btn btn-neutral" onClick={() => onChange(value + 1)}>
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">Ποντάρισμα 0–3 πόντοι</div>
      </div>
    );
  }

  // ——— Single-forward Nav ———
  function NavButtons() {
    const nextDisabled =
      stage === STAGES.ANSWER
        ? !isFinalIndex
          ? !answered[index]
          : !finalResolved.p1
        : false;

    const isFinalAnswerStage = stage === STAGES.ANSWER && isFinalIndex;

    if (isFinalAnswerStage) {
      // On the final answer screen, direct the player to the standings.
      return (
        <div className="flex items-center justify-center">
          <button
            onClick={() => {
              // Progress to the results stage…
              setStage(STAGES.RESULTS);
              // …and, if supplied, open the leaderboard overlay immediately.
              if (onOpenOverlayRequest) onOpenOverlayRequest();
            }}
            className="btn btn-accent disabled:opacity-50"
            disabled={nextDisabled}
            title={
              nextDisabled ? "Καταχώρισε πρώτα την απάντηση" : "Προβολή κατάταξης"
            }
          >
            Δες κατάταξη →
          </button>
        </div>
      );
    }

    const label =
      stage === STAGES.CATEGORY
        ? "Επόμενη ερώτηση"
        : stage === STAGES.ANSWER
        ? "Επόμενη κατηγορία"
        : "Επόμενο →";

    const title =
      stage === STAGES.ANSWER && nextDisabled
        ? "Καταχώρισε πρώτα την απάντηση"
        : "Επόμενο";

    return (
      <div className="flex items-center justify-center">
        <button
          onClick={next}
          className="btn btn-accent disabled:opacity-50"
          disabled={nextDisabled}
          title={title}
        >
          {label}
        </button>
      </div>
    );
  }

  // ——— Lightweight self-tests ———
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#selftest") return;
    try {
      const applyFinal = (score, bet, outcome) =>
        outcome === "correct" ? score + bet : score - bet;
      console.assert(
        applyFinal(10, 3, "correct") === 13,
        "Final: +bet on correct"
      );
      console.assert(applyFinal(10, 2, "wrong") === 8, "Final: -bet on wrong");
      const streakBonus = (prev, same) => ((same ? prev + 1 : 1) >= 3 ? 1 : 0);
      console.assert(
        streakBonus(2, true) === 1 && streakBonus(1, true) === 0,
        "Streak bonus from 3rd correct"
      );
      console.log("%cSelf-tests passed (solo)", "color: #10b981");
    } catch (e) {
      console.warn("Self-tests failed", e);
    }
  }, []);

  return (
    <div
      className="min-h-screen w-full flex justify-center items-start p-4 bg-background"
    >
      <div className="w-full max-w-4xl space-y-4 text-slate-100">
        {/* HUD */}
        <HUDHeader
          stage={stage}
          current={index}
          total={QUESTIONS.length}
          score={p1.score}
          streak={p1.streak}
          justScored={justScored}
          justLostStreak={justLostStreak}
        />

        {/* Modals */}
        {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
        {showFinalHowTo && (
          <FinalHowToModal onClose={() => setShowFinalHowTo(false)} />
        )}

        {/* Stages */}
        {stage === STAGES.NAME && !p1.name && <NameStage />}
        {stage === STAGES.INTRO && <IntroStage onNavigateHome={onNavigateHome} />}
        {stage === STAGES.CATEGORY && <CategoryStage />}
        {stage === STAGES.QUESTION && <QuestionStage />}
        {stage === STAGES.ANSWER && <AnswerStage />}
        {stage === STAGES.RESULTS && <ResultsStage />}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 font-ui">
          <div>Στάδιο: {stageLabel(stage)}</div>
          <div className="flex items-center gap-3">
            {stage !== STAGES.INTRO && (
              <button className="btn btn-neutral" onClick={resetGame}>
                Επαναφορά παιχνιδιού
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function stageLabel(stage) {
  switch (stage) {
    case STAGES.NAME:
      return "Όνομα παίκτη";
    case STAGES.INTRO:
      return "Εισαγωγή";
    case STAGES.CATEGORY:
      return "Στάδιο Κατηγορίας";
    case STAGES.QUESTION:
      return "Στάδιο Ερώτησης";
    case STAGES.ANSWER:
      return "Στάδιο Απάντησης";
    case STAGES.FINALE:
      return "Τελικός (Στοίχημα)";
    case STAGES.RESULTS:
      return "Αποτελέσματα";
    default:
      return "";
  }
}

/* ——— HowTo (generic) ——— */
function HowToModal({ onClose, totalQuestions = 9 }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="relative w-full max-w-[680px] font-ui rounded-2xl shadow-xl ring-1 ring-slate-700 bg-slate-800 text-slate-200 flex flex-col overflow-hidden max-h-[clamp(420px,85dvh,760px)]">
          <div className="sticky top-0 z-10 px-6 py-4 bg-slate-800/80 backdrop-blur-sm rounded-t-2xl flex items-center justify-between border-b border-slate-700">
            <h2 className="font-display text-2xl font-extrabold">Πώς παίζεται</h2>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn btn-neutral">Κλείσιμο ✕</button>
            </div>
          </div>

          <div className="scroll-area px-6 pb-6 pt-2 flex-1 min-h-0 text-sm md:text-base leading-relaxed">
            <ul className="mt-2 list-disc pl-5 space-y-2">
              <li><strong>{totalQuestions} ερωτήσεις.</strong> Κάθε μία έχει συγκεκριμένους πόντους (ανάλογα με τη δυσκολία).</li>
              <li><strong>Στόχος:</strong> μάζεψε όσο περισσότερους πόντους μπορείς.</li>
              <li><strong>Χ2:</strong> Όταν εμφανίζεται η Κατηγορία μπορείς να ενεργοποιήσεις το Χ2. Αυτό μπορεί να γίνει <strong>μία φορά</strong> ανά παιχνίδι. Διπλασιάζει μόνο τους πόντους αυτής της ερώτησης.</li>
              <li><strong>Σερί:</strong> Από την <strong>3η συνεχόμενη σωστή</strong> και μετά, παίρνεις έξτρα <strong>+1</strong> (δεν διπλασιάζεται). Το σερί μηδενίζεται σε λάθος/καμία απάντηση.</li>
              <li><strong>Τελική ερώτηση (στοίχημα 0–3):</strong> Πριν εμφανιστεί η τελευταία ερώτηση, διάλεξε πόσους πόντους θα ρισκάρεις (0–3). Αν απαντήσεις σωστά, <strong>κερδίζεις</strong> τόσους πόντους· αν απαντήσεις λάθος ή δεν απαντήσεις, <strong>χάνεις</strong> τους ίδιους πόντους. Αν βάλεις 0, ούτε κερδίζεις ούτε χάνεις. <em>Το Χ2 δεν επιτρέπεται και δεν προστίθεται το bonus του σερί.</em> <span className="block text-slate-400 mt-1 text-[0.95em]">Παράδειγμα: σκορ 15 και στοίχημα 2 → σωστό = 17, λάθος/καμία απάντηση = 13.</span></li>
            </ul>
            <div className="howto-shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ——— Final-question reminder ——— */
function FinalHowToModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="relative w-full max-w-[640px] font-ui rounded-2xl shadow-xl ring-1 ring-slate-700 bg-slate-800 text-slate-200 flex flex-col overflow-hidden">
          <div className="sticky top-0 z-10 px-6 py-4 bg-slate-800/80 backdrop-blur-sm rounded-t-2xl flex items-center justify-between border-b border-slate-700">
            <h2 className="font-display text-2xl font-extrabold">Τελική ερώτηση — Πώς παίζεται</h2>
            <button onClick={onClose} className="btn btn-neutral">Κλείσιμο ✕</button>
          </div>

          <div className="px-6 pb-6 pt-3 text-sm md:text-base leading-relaxed">
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Στοίχημα 0–3.</strong> Πριν δεις την ερώτηση, διάλεξε πόσους πόντους θα ρισκάρεις.</li>
              <li><strong>Σωστό:</strong> κερδίζεις + στοίχημα πόντους. <strong>Λάθος/Καμία απάντηση:</strong> χάνεις − στοίχημα πόντους.</li>
              <li><strong>Δεν ισχύει Χ2</strong> και <strong>δεν προστίθεται bonus σερί</strong> στον τελικό.</li>
              <li className="text-slate-400 text-[0.95em]">Παράδειγμα: σκορ 15 και στοίχημα 2 → σωστό = 17, λάθος/καμία απάντηση = 13.</li>
            </ul>

            <div className="mt-5 flex justify-center">
              <button className="btn btn-accent px-6 py-2" onClick={onClose}>
                Το κατάλαβα
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
