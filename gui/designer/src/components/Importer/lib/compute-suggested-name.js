/**
 * SnapGene-style autoname helper (M-B.1 K3 + K6, DEC-IMP-10).
 *
 *   computeSuggestedName('pUC19', new Set(['pUC19']))               → 'pUC19 (1)'
 *   computeSuggestedName('pUC19', new Set(['pUC19', 'pUC19 (1)']))  → 'pUC19 (2)'
 *   computeSuggestedName('pUC19 (3)', new Set(['pUC19 (3)']))       → 'pUC19 (4)'
 *   computeSuggestedName('pUC19', new Set())                        → 'pUC19'  (no collision)
 *
 * If `baseName` already ends with ` (N)` and that name is taken, the helper
 * reuses the stem and starts counting from N+1 — matching SnapGene behaviour
 * when biolog imports `pUC19 (3).gb` while `pUC19 (3)` already exists.
 */
const SUFFIX_RE = /^(.+?)\s+\((\d+)\)$/;

export function computeSuggestedName(baseName, existingNames) {
  if (!baseName) return baseName;
  if (!(existingNames instanceof Set)) existingNames = new Set(existingNames || []);
  if (!existingNames.has(baseName)) return baseName;

  let stem = baseName;
  let n = 1;
  const m = baseName.match(SUFFIX_RE);
  if (m) {
    stem = m[1];
    n = parseInt(m[2], 10) + 1;
  }
  while (existingNames.has(`${stem} (${n})`)) n += 1;
  return `${stem} (${n})`;
}
