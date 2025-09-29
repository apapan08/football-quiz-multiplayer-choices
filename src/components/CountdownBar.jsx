// src/components/CountdownBar.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * CountdownBar
 * - Visual shrinking bar + mm:ss (or ss) text
 * - Uses an absolute deadline (deadlineMs) for robustness against tab sleeps
 * - Pauses when `paused` is true or the tab is hidden; pushes deadline forward
 * - Persists adjusted deadline to localStorage via `persistKey` (optional)
 *
 * Props:
 *  - totalMs: number (duration in ms for the whole countdown)
 *  - deadlineMs: number (absolute epoch ms when the countdown should hit 0)
 *  - paused: boolean (external pause signal, e.g., modal open)
 *  - onExpire: () => void (fires once when time reaches 0)
 *  - label?: string (ARIA label; defaults to "Χρόνος")
 *  - persistKey?: string (localStorage key to store updated deadline)
 *  - onDeadlineChange?: (newDeadline: number) => void
 */
export default function CountdownBar({
  totalMs,
  deadlineMs,
  paused = false,
  onExpire = () => {},
  label,
  persistKey,
  onDeadlineChange,
}) {
  const deadlineRef = useRef(deadlineMs);
  const pauseStartRef = useRef(null);
  const expiredRef = useRef(false);
  const lastUiUpdateRef = useRef(Date.now());
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, deadlineMs - Date.now())
  );
  const [docHidden, setDocHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );

  // Keep internal deadline in sync with prop
  useEffect(() => {
    deadlineRef.current = deadlineMs;
    expiredRef.current = false;
    setRemainingMs(Math.max(0, deadlineMs - Date.now()));
  }, [deadlineMs]);

  // Track page visibility for auto-pause
  useEffect(() => {
    function onVis() {
      setDocHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // When pausing/resuming, shift deadline forward by the paused duration
  useEffect(() => {
    const isPaused = paused || docHidden;
    if (isPaused) {
      if (!pauseStartRef.current) pauseStartRef.current = Date.now();
    } else {
      if (pauseStartRef.current) {
        const pausedFor = Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
        deadlineRef.current += pausedFor;
        if (persistKey) {
          try {
            localStorage.setItem(persistKey, String(deadlineRef.current));
          } catch {}
        }
        if (onDeadlineChange) onDeadlineChange(deadlineRef.current);
      }
    }
  }, [paused, docHidden, persistKey, onDeadlineChange]);

  // Animation loop (~5–7 FPS state updates; rAF for smooth bar)
  useEffect(() => {
    let raf;
    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, deadlineRef.current - now);

      // throttle state updates
      if (!(paused || docHidden)) {
        if (now - lastUiUpdateRef.current >= 180 || remaining <= 0) {
          lastUiUpdateRef.current = now;
          setRemainingMs(remaining);
        }
        if (remaining <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          onExpire();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, docHidden, onExpire]);

  // UI
  const progress = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;
  const secs = Math.ceil(remainingMs / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const text = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`;

  return (
    <div className="mt-3 relative" aria-live="polite">
      <div
        className="h-2 w-full rounded-full bg-slate-700/40 overflow-hidden"
        role="timer"
        aria-label={label ? `${label}: ${text}` : `Χρόνος: ${text}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, progress * 100)}%`,
            background: "linear-gradient(90deg,#F11467,#BA1ED3)",
            transition: "width 0.16s linear",
          }}
        />
      </div>
    </div>
  );
}
