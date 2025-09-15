// src/lib/catalogs.js
import Fuse from "fuse.js";

const cache = new Map();

const FUSE_OPTS = {
  keys: ["name", "aliases"], // include aliases in fuzzy fallback
  includeScore: true,
  threshold: 0.55,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

export function norm(s = "") {
  return s
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ς/g, "σ");
}

function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toItem(nameOrObj, catalogName) {
  if (typeof nameOrObj === "string") {
    const n = String(nameOrObj);
    return {
      id: `${catalogName}:${slug(n)}`,
      key: null,
      name: n,
      aliases: [],
      _norm: norm(n),
      _aliasesNorm: [],
    };
  }
  // object entry: { key?, name, aliases? }
  const name = String(nameOrObj.name ?? "");
  const aliases = Array.isArray(nameOrObj.aliases) ? nameOrObj.aliases.map(String) : [];
  const key = nameOrObj.key ?? nameOrObj.code ?? nameOrObj.iso2 ?? null;

  return {
    id: `${catalogName}:${slug(name)}`,
    key,
    name,
    aliases,
    _norm: norm(name),
    _aliasesNorm: aliases.map(norm),
  };
}

export async function getCatalog(name) {
  if (cache.has(name)) return cache.get(name);

  let list = [];
  try {
    const res = await fetch(`/data/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list = await res.json(); // strings OR objects
  } catch (e) {
    console.warn(`Catalog "${name}" could not be loaded:`, e);
    list = [];
  }

  const items = list.map((entry) => toItem(entry, name));

  // Map from normalized token -> item (include aliases)
  const byName = new Map();
  for (const it of items) {
    if (!byName.has(it._norm)) byName.set(it._norm, it);
    for (const a of it._aliasesNorm) {
      if (!byName.has(a)) byName.set(a, it);
    }
  }

  const fuse = new Fuse(items, FUSE_OPTS);
  const out = { items, fuse, byName };
  cache.set(name, out);
  return out;
}
