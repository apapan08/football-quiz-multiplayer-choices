import React, { useEffect, useId, useMemo, useState } from "react";
import { getCatalog, norm } from "../lib/catalogs";

export default function AutoCompleteAnswer({
  catalog,
  placeholder = "Άρχισε να πληκτρολογείς…",
  onSelect,
  onChangeText,
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // highlighted index
  const listId = useId();

  useEffect(() => { onChangeText?.(q); }, [q, onChangeText]);

  useEffect(() => {
    let active = true;
    (async () => {
      const term = q.trim();
      const tnorm = norm(term);
      if (tnorm.length < 2) { setResults([]); setHi(0); return; }

      const { items, fuse } = await getCatalog(catalog);

      // Helper: build normalized fields to check (name + aliases if present)
      const fieldsOf = (it) => {
        const arr = [it.name, ...(it.aliases || [])];
        return arr.map(norm);
      };

      // Rank function: 3 = startsWith, 2 = wordStartsWith, 1 = includes, 0 = no match
      const rankItem = (it, qn) => {
        const f = fieldsOf(it);
        const starts = f.some(s => s.startsWith(qn));
        if (starts) return 3;
        const wordStart = f.some(s => s.split(/\s+/).some(w => w.startsWith(qn)));
        if (wordStart) return 2;
        const has = f.some(s => s.includes(qn));
        if (has) return 1;
        return 0;
      };

      // Build strict matches first (prefix → wordPrefix → includes)
      let scored = items
        .map(it => ({ it, score: rankItem(it, tnorm) }))
        .filter(r => {
          if (tnorm.length <= 2) return r.score === 3; // ONLY prefix for very short queries
          return r.score > 0;                           // otherwise allow includes too
        });

      // If nothing matched and query is long enough, try a conservative fuzzy fallback
      if (scored.length === 0 && tnorm.length >= 3 && fuse) {
        const fuzz = fuse.search(term, { limit: 20 })
          .map(r => ({ it: r.item, fscore: typeof r.score === "number" ? r.score : 1 }))
          .filter(r => r.fscore <= 0.2); // conservative threshold
        const seen = new Set();
        scored = [];
        for (const r of fuzz) {
          if (!seen.has(r.it.id)) { seen.add(r.it.id); scored.push({ it: r.it, score: 0.5 }); }
          if (scored.length >= 10) break;
        }
      }

      // Sort by score desc, then by name; cap to 10
      const out = scored
        .sort((a,b) => (b.score - a.score) || a.it.name.localeCompare(b.it.name))
        .slice(0, 10)
        .map(r => r.it);

      if (active) { setResults(out); setHi(0); }
    })();
    return () => { active = false; };
  }, [q, catalog]);

  const choose = (item) => {
    // If user typed Greek, prefer showing a Greek alias in the input after choose
    const isGreek = /\p{Script=Greek}/u.test(q);
    const greek = (item.aliases || []).find(a => /\p{Script=Greek}/u.test(a));
    setQ(isGreek && greek ? greek : item.name);
    setOpen(false);
    onSelect?.(item);
  };

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      if (open && results[hi]) {
        e.preventDefault();
        choose(results[hi]);
      }
    }
  }

  // Highlighter for the *label* we render (Greek alias if user types Greek)
  const highlighted = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return {};
    const isGreek = /\p{Script=Greek}/u.test(q);
    const make = (label) => {
      const nl = (label || "").toLowerCase();
      const pos = nl.indexOf(ql);
      if (pos === -1) return <span className="text-sm font-semibold">{label}</span>;
      return (
        <span className="text-sm font-semibold">
          {label.slice(0, pos)}
          <mark className="rounded px-0.5" style={{ background: "rgba(241,20,103,.25)" }}>
            {label.slice(pos, pos + ql.length)}
          </mark>
          {label.slice(pos + ql.length)}
        </span>
      );
    };
    const pickLabel = (r) => {
      if (!isGreek) return r.name;
      const greek = (r.aliases || []).find(a => /\p{Script=Greek}/u.test(a));
      return greek || r.name;
    };
    return Object.fromEntries(results.map(r => [r.id, make(pickLabel(r))]));
  }, [results, q]);

  const expanded = open && results.length > 0;

  return (
    <div className="relative z-40">
      <input
        className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
        placeholder={placeholder}
        value={q}
        onChange={(e)=>{ setQ(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
        onBlur={()=>setTimeout(()=>setOpen(false),120)}
        onFocus={()=> q && setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && results[hi] ? `${listId}-opt-${hi}` : undefined}
      />

      {open && (
        <div
          className="absolute z-50 mt-2 w-full rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: "var(--brand-card)",
            border: "1px solid var(--brand-border)",
            backdropFilter: "blur(6px)",
          }}
        >
          {results.length > 0 ? (
            <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => {
                const active = i === hi;
                return (
                  <li key={r.id} role="option" id={`${listId}-opt-${i}`} aria-selected={active}>
                    <button
                      className="group relative block w-full text-left px-4 py-2.5"
                      onMouseDown={(e)=>e.preventDefault()}
                      onMouseEnter={()=>setHi(i)}
                      onClick={()=>choose(r)}
                      style={{
                        color: "white",
                        background: active ? "rgba(241,20,103,0.14)" : "transparent",
                        borderLeft: active ? "3px solid var(--brand-accent)" : "3px solid transparent",
                      }}
                    >
                      {highlighted[r.id] ?? (<span className="text-sm font-semibold">{r.name}</span>)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
              Δεν βρέθηκαν αποτελέσματα
            </div>
          )}
        </div>
      )}
    </div>
  );
}
