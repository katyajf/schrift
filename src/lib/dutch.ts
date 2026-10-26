export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

// Mirrors public.dutch_key() in the database: "Het Café" -> "cafe".
export function dutchKey(s: string) {
  return stripAccents(s.trim().replace(/^(de|het|een|'t)\s+/i, "")).toLowerCase();
}

// Mirrors entries.search_text, so a query matches regardless of case and accents.
export function normalizeForSearch(s: string) {
  return stripAccents(s).toLowerCase().trim();
}
