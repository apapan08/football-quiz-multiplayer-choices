import React from "react";
import { Logo } from "../App.jsx";

export type ResultRow = {
  i: number;
  category: string;
  points: number;
  isFinal?: boolean;
  correct?: boolean | null;
  x2?: boolean;
  answerText?: string | null;
  answerSide?: "p1" | "p2" | null;
  delta: number;
  total: number;
  streakPoints?: number;
};

type Props = {
  rows: ResultRow[];
  title?: string;
  playerName?: string;
  /** NEW: total score to show under the player name */
  totalScore?: number;
  maxStreak?: number;
  onReset?: () => void;
  lang?: "el" | "en";
};

const STR = {
  el: {
    results: "Αποτελέσματα",
    player: "Παίκτης",
    score: "Σκορ",
    maxStreak: "Μεγαλύτερο σερί",
    category: "Κατηγορία",
    correct: "Σωστό",
    wrong: "Λάθος",
    final: "Τελικός",
    points: "Πόντοι",
    streak: "Σερί",
    x2: "×2",
    answerSide: "Απάντηση Παίκτη",
    delta: "+/−",
    total: "Σύνολο",
    playAgain: "Επαναφορά παιχνιδιού",
    draw: "Ισοπαλία / Καμία απάντηση",
  },
  en: {
    results: "Results",
    player: "Player",
    score: "Score",
    maxStreak: "Longest streak",
    category: "Category",
    correct: "Correct",
    wrong: "Wrong",
    final: "Final",
    points: "Points",
    streak: "Streak bonus",
    x2: "×2",
    answerSide: "Player Answer",
    delta: "+/−",
    total: "Total",
    playAgain: "Play again",
    draw: "Draw / No answer",
  },
};

export default function ResultsTableResponsive({
  rows,
  title,
  playerName,
  totalScore,   // ← NEW
  maxStreak,
  onReset,
  lang = "el",
}: Props) {
  const t = STR[lang];

  return (
    <>
      <div className="bg-gray-200 py-4 rounded-t-lg mb-4">
        <Logo className="mx-auto h-32 w-auto mb-8" />
      </div>
      <div className="card overflow-hidden mt-4" style={{ backgroundColor: 'var(--surface-color)' }}>
        {/* Header */}
        <div className="text-center">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: 'var(--text-color)' }}>
            {title || t.results}
          </h2>
          {playerName && (
            <div className="mt-1" style={{ color: 'var(--text-color-secondary)' }}>
              {t.player}: <span className="font-semibold">{playerName}</span>
            </div>
          )}
          {/* NEW: Score line between player and max streak */}
          {typeof totalScore === "number" && (
            <div className="mt-1 font-semibold tabular-nums" style={{ color: 'var(--text-color)' }}>
              {t.score}: {totalScore}
            </div>
          )}
          {typeof maxStreak === "number" && (
            <div className="text-sm" style={{ color: 'var(--text-color-secondary)' }}>
              {t.maxStreak}: {maxStreak}
            </div>
          )}
        </div>

        {/* Mobile stacked list */}
        <ul className="sm:hidden mt-4 grid gap-2">
          {rows.map((r) => (
            <li key={r.i} className="p-3 overflow-hidden rounded-lg" style={{ backgroundColor: 'var(--secondary-color)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: 'var(--text-color-secondary)' }}>#{r.i}</div>
                  <div className="font-semibold truncate" style={{ color: 'var(--text-color)' }}>
                    {r.category}{" "}
                    {r.isFinal && (
                      <span className="ml-1 align-middle pill text-[10.5px] px-2 py-[2px]" style={{ backgroundColor: 'var(--secondary-color)' }}>
                        {t.final}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold tabular-nums leading-tight" style={{ color: 'var(--text-color)' }}>
                    {r.total}
                  </div>
                  <div className="text-xs tabular-nums" style={{ color: 'var(--text-color-secondary)' }}>
                    {r.delta >= 0 ? `+${r.delta}` : r.delta}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[12px] flex flex-wrap items-center gap-x-2.5 gap-y-1" style={{ color: 'var(--text-color-secondary)' }}>
                {r.correct === true ? (
                  <span className="pill text-white text-[10.5px] px-2 py-[2px]" style={{ backgroundColor: 'var(--primary-color)' }}>
                    {t.correct}
                  </span>
                ) : r.correct === false ? (
                  <span className="pill text-white text-[10.5px] px-2 py-[2px]" style={{ backgroundColor: 'var(--accent-color)' }}>
                    {t.wrong}
                  </span>
                ) : (
                  <span className="pill text-[10.5px] px-2 py-[2px]" style={{ backgroundColor: 'var(--secondary-color)' }}>
                    {t.draw}
                  </span>
                )}

                <span className="whitespace-nowrap">×{r.points}</span>
                <span className="whitespace-nowrap">
                  {t.streak}: {r.streakPoints ? `+${r.streakPoints}` : "—"}
                </span>

                {r.x2 && (
                  <span className="pill text-white text-[10.5px] px-2 py-[2px]" style={{ backgroundColor: 'var(--accent-color)' }}>
                    {t.x2}
                  </span>
                )}

                <span className="ml-auto max-w-[48%] truncate italic" style={{ color: 'var(--text-color-secondary)' }}>
                  {r.answerText && r.answerText.trim().length > 0 ? r.answerText : "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop / Tablet table */}
        <div className="hidden sm:block mt-4 -mx-4 sm:mx-0 pb-[env(safe-area-inset-bottom)]">
          <div className="overflow-x-auto overscroll-contain results-scroll [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[780px] w-full table-fixed text-[13px] sm:text-sm leading-tight" style={{ color: 'var(--text-color)' }}>
              <thead>
                <tr className="[&>th]:px-2 [&>th]:py-2 sm:[&>th]:px-3 sm:[&>th]:py-3 text-left" style={{ color: 'var(--text-color-secondary)' }}>
                  <th className="w-8 tabular-nums">#</th>
                  <th className="w-[44%]">{t.category}</th>
                  <th className="w-28">{`${t.correct}/${t.wrong}`}</th>
                  <th className="w-16">{t.points}</th>
                  <th className="w-16">{t.streak}</th>
                  <th className="w-12">{t.x2}</th>
                  <th className="w-40">{t.answerSide}</th>
                  <th className="w-16 tabular-nums">{t.delta}</th>
                  <th className="w-16 tabular-nums">{t.total}</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-2 sm:[&>tr>td]:px-3 sm:[&>tr>td]:py-3">
                {rows.map((r) => (
                  <tr key={r.i} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td className="tabular-nums text-right">{r.i}</td>

                    <td className="max-w-[280px] truncate" title={r.category}>
                      {r.category}
                      <span className="ml-2 align-middle pill text-[11px]" style={{ backgroundColor: 'var(--secondary-color)' }}>
                        {r.isFinal ? t.final : `×${r.points}`}
                      </span>
                    </td>

                    <td className="whitespace-nowrap">
                      {r.correct === true ? (
                        <span className="pill text-white" style={{ backgroundColor: 'var(--primary-color)' }}>{t.correct}</span>
                      ) : r.correct === false ? (
                        <span className="pill text-white" style={{ backgroundColor: 'var(--accent-color)' }}>{t.wrong}</span>
                      ) : (
                        <span className="pill" style={{ backgroundColor: 'var(--secondary-color)' }}>{t.draw}</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap">
                      {r.isFinal ? "0×–3×" : `×${r.points}`}
                    </td>

                    <td className="whitespace-nowrap tabular-nums">
                      {r.isFinal ? "—" : r.streakPoints ? `+${r.streakPoints}` : "—"}
                    </td>

                    <td>{r.x2 ? "×2" : "—"}</td>

                    <td className="max-w-[220px] truncate italic" style={{ color: 'var(--text-color-secondary)' }}>
                      {r.answerText && r.answerText.trim().length > 0 ? r.answerText : "—"}
                    </td>

                    <td className="tabular-nums">
                      {r.delta >= 0 ? `+${r.delta}` : r.delta}
                    </td>
                    <td className="font-bold tabular-nums">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {onReset && (
          <div className="mt-6 flex justify-center">
            <button className="btn btn-accent" onClick={onReset}>
              {t.playAgain}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
