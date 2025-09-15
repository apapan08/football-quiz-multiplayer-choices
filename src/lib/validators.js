import { getCatalog, norm } from "./catalogs";

/**
 * Parse "2-3", "2:3", "2×3", "2 x 3", etc. into {home, away}.
 * Accepts en-dash/em-dash/minus and common separators.
 */
export function parseScore(s = "") {
  const cleaned = s.toString().replace(/[–—−:x×]/g, "-");
  const m = cleaned.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

/**
 * Flexible score parser: works with either a string or an object {home,away}.
 * Used by validate() so scoreline answers can be passed as objects.
 */
function parseScoreFlexible(v) {
  if (v && typeof v === "object") {
    const h = Number(v.home),
      a = Number(v.away);
    if (Number.isFinite(h) && Number.isFinite(a)) return { home: h, away: a };
    return null;
  }
  if (typeof v === "string") return parseScore(v);
  return null;
}

/**
 * Numeric parser: accepts numbers or numeric strings (comma or dot).
 */
export function parseNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === "object" && "value" in v) {
    const n = Number(String(v.value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Validate an answer against a question’s configuration.
 * Supports: "catalog", "scoreline", "numeric", and fallback "text".
 *
 * Returns: { correct: boolean, canonical: string|null }
 *
 * NOTE: For "catalog", this expects getCatalog() to return items that may have:
 *  - key (e.g., ISO-2), name, aliases[], and internal _norm/_aliasesNorm
 */
export async function validate(q, chosenOrText) {
  const mode = q.answerMode || "text";

  // ------------------------
  // CATALOG (players, coaches, countries, teams, stadiums)
  // ------------------------
  if (mode === "catalog") {
    const { byName } = await getCatalog(q.catalog);

    // Resolve candidate: if user selected from dropdown, it's an object; else try lookup by normalized text
    const candidate = (typeof chosenOrText === "string")
      ? byName.get(norm(chosenOrText))
      : chosenOrText; // already a catalog item {id,name,key?,aliases?,_norm,_aliasesNorm?}

    if (!candidate) return { correct: false, canonical: null };

    // Preferred: stable keys (e.g. ISO-2)
    const acceptKeys = Array.isArray(q.acceptKeys) ? new Set(q.acceptKeys.map(String)) : null;
    if (acceptKeys && candidate.key && acceptKeys.has(String(candidate.key))) {
      return { correct: true, canonical: candidate.name };
    }

    // Fallback: match any normalized label (name or aliases) to accepted strings
    const accepted = new Set((q.accept || []).map(norm));
    const candidateNorms = new Set([candidate._norm, ...((candidate._aliasesNorm || []))]);
    const correct = [...candidateNorms].some(n => accepted.has(n));

    return { correct, canonical: candidate.name };
  }

  // ------------------------
  // SCORELINE (e.g., 2–3). Accepts object {home,away} or string "2-3".
  // If q.teams is provided, order is enforced (home vs away).
  // If not, reversed order is also accepted.
  // ------------------------
  if (mode === "scoreline") {
    const got = parseScoreFlexible(chosenOrText);
    if (!got) return { correct: false, canonical: null };

    const accepted = (q.acceptScores || []).map((s) => ({
      home: Number(s.home),
      away: Number(s.away),
    }));

    let correct = false;
    for (const s of accepted) {
      if (q.teams) {
        // ordered (home/away fixed)
        if (got.home === s.home && got.away === s.away) {
          correct = true;
          break;
        }
      } else {
        // unordered (accept reversed)
        if (
          (got.home === s.home && got.away === s.away) ||
          (got.home === s.away && got.away === s.home)
        ) {
          correct = true;
          break;
        }
      }
    }
    return { correct, canonical: `${got.home}-${got.away}` };
  }

  // ------------------------
  // NUMERIC (exact value, tolerance, or range)
  // Supported question fields:
  //   - acceptNumber     (single exact)
  //   - acceptNumbers[]  (list of exacts)
  //   - answerNumber     (alias for exact)
  //   - tolerance        (±tolerance around answerNumber)
  //   - min / max        (inclusive range)
  // ------------------------
  if (mode === "numeric") {
    const n = parseNumber(chosenOrText);
    if (n == null) return { correct: false, canonical: null };

    // Exact(s)
    const list =
      Array.isArray(q.acceptNumbers) && q.acceptNumbers.length
        ? q.acceptNumbers
        : [q.acceptNumber, q.answerNumber, q.answer]
            .filter((x) => x !== undefined)
            .map((x) => parseNumber(x))
            .filter((x) => x != null);

    if (list.length > 0) {
      // With tolerance if provided (applies to first numeric in list)
      if (Number.isFinite(q.tolerance) && list.length === 1) {
        const target = Number(list[0]);
        const tol = Math.abs(Number(q.tolerance) || 0);
        const correct = Math.abs(n - target) <= tol;
        return { correct, canonical: String(n) };
      }

      const correct = list.some((x) => Number(x) === n);
      return { correct, canonical: String(n) };
    }

    // Range
    if (Number.isFinite(q.min) || Number.isFinite(q.max)) {
      const lo = Number.isFinite(q.min) ? Number(q.min) : -Infinity;
      const hi = Number.isFinite(q.max) ? Number(q.max) : +Infinity;
      const correct = n >= lo && n <= hi;
      return { correct, canonical: String(n) };
    }

    // Fallback: no rules ⇒ not correct
    return { correct: false, canonical: String(n) };
  }

  // ------------------------
  // TEXT (fallback; normalized exact match vs answer/accept[])
  // ------------------------
  const accepted = [q.answer, ...(q.accept || [])].map(norm);
  const correct = accepted.includes(norm(chosenOrText || ""));
  return { correct, canonical: correct ? q.answer : null };
}
