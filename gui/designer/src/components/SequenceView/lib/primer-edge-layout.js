import { clampCharsPerLine } from './grid.js';

const LEGACY_MIN_CHARS_PER_LINE = 30;

/** Half of the longest rendered I-run, plus one cell for stroke/hit paint. */
export function primerInsertionEdgeGuardChars(occurrences) {
  let longestInsertion = 0;
  for (const occurrence of occurrences || []) {
    for (const run of occurrence?.alignment?.runs || []) {
      if (run?.op !== 'I') continue;
      const length = Number(run.queryEnd) - Number(run.queryStart);
      if (Number.isFinite(length) && length > longestInsertion) longestInsertion = length;
    }
  }
  return longestInsertion > 0 ? Math.ceil(longestInsertion / 2) + 1 : 0;
}

/** Keep the legacy 30-base snap when it fits; below it, preserve the edge guards. */
export function fitPrimerAwareCharsPerLine({
  availableChars,
  labelChars,
  edgeGuardChars,
  preference,
}) {
  const capacity = Math.floor(Number(availableChars))
    - Math.max(0, Number(labelChars) || 0)
    - 2 * Math.max(0, Number(edgeGuardChars) || 0);
  const cap = Number.isFinite(preference) && preference > 0
    ? Math.max(1, Math.floor(preference))
    : 150;
  if (capacity < LEGACY_MIN_CHARS_PER_LINE) {
    return Math.min(cap, Math.max(1, capacity));
  }
  return Math.min(cap, clampCharsPerLine(capacity));
}
