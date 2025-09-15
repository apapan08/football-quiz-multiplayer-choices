import React from "react";

export default function NumericAnswer({ value = 0, onChange, step = 1, min = 0, max = 999 }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const set = (n) => onChange?.(clamp(n));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-neutral" onClick={()=>set((value||0)-step)}>−</button>
        <input
          className="w-28 text-center rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value ?? 0}
          onChange={(e)=> set(Number(e.target.value.replace(/\D+/g,"") || 0))}
        />
        <button type="button" className="btn btn-neutral" onClick={()=>set((value||0)+step)}>+</button>
      </div>
      <div className="text-xs text-slate-400">Αριθμητική απάντηση</div>
    </div>
  );
}
