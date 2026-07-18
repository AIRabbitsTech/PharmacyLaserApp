// Shared source of truth for canonicalizing medicine names. Keeps the
// autocomplete dedup, the on-blur snap, and the save path in agreement so the
// sales table stops accumulating spelling variants of the same medicine.

// SAFE normalization: case-fold + collapse internal whitespace. This is the key
// used to dedup suggestions and the canonical form written for brand-new names.
// Deliberately does NOT remove spaces, so it never merges names that only the
// looser key would consider equal.
export function normalizeMedicineName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

// LOOSE matching key: also ignores spaces and punctuation, so "ACILOC 300",
// "ACILOC300" and "ACILOC-300" share one key. Used only to find an existing
// spelling to snap onto — never to auto-rewrite stored data in bulk.
export function looseMedicineKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Canonicalize a typed name at commit time:
//   1. If it loosely matches an existing suggestion, snap to that exact spelling
//      (prevents space/punctuation variants like ACILOC300 vs ACILOC 300).
//   2. Otherwise it's a genuinely new medicine — store the normalized form.
// Returns '' for blank input so empty rows stay empty.
export function canonicalizeMedicineName(typed: string, existing: string[]): string {
  const trimmed = typed.trim();
  if (!trimmed) return '';
  const key = looseMedicineKey(trimmed);
  const match = existing.find((s) => looseMedicineKey(s) === key);
  return match ?? normalizeMedicineName(trimmed);
}
