import { sequenceDiff } from '../../sequence-diff';

/**
 * K8 (Sprint 1.6) — compute per-nucleotide mutation highlights.
 *
 * Primary: diff against the parent-part sequence (fragment.parentId → parts).
 *   - aaChange.silent === true  → 'silent'     (yellow)
 *   - otherwise                 → 'nonsilent'  (red)
 * Fallback (no parent): use fragment.mutations list, mark conservatively as
 *   'nonsilent'. Insertions/deletions span `insertSequence.length` / `deletedBp`.
 *
 * K9/V16 — honors `fragment.templateStart`: for split sub-fragments whose
 * sequence is a window of the parent gene, we slice parent at templateStart
 * before diffing. Without this the diff treats parent[0] as aligned to
 * fragment[0] and reports the entire sub-fragment as mutated.
 *
 * @param {Object} fragment — { sequence, annotations?, parentId?, mutations?, templateStart? }
 * @param {Object|null} parent — parts library entry or null
 * @returns {Map<number, 'silent'|'nonsilent'>}
 */
export function computeMutationHighlights(fragment, parent) {
  const map = new Map();
  if (!fragment?.sequence) return map;

  if (parent?.sequence) {
    const offset = fragment.templateStart || 0;
    const parentSlice = parent.sequence.slice(offset, offset + fragment.sequence.length);
    const cdsRegions = (fragment.annotations || [])
      .filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
      .map(a => ({ start: a.start, end: a.end }));
    const diff = sequenceDiff(parentSlice, fragment.sequence, cdsRegions);
    for (const sub of diff.substitutions) {
      const kind = sub.aaChange?.silent === true ? 'silent' : 'nonsilent';
      map.set(sub.pos, kind);
    }
    return map;
  }

  for (const m of fragment.mutations || []) {
    const pos = m.codonStart ?? m.position ?? 0;
    const len = m.type === 'insertion' ? (m.insertSequence?.length || 0)
              : m.type === 'deletion'  ? (m.deletedBp || 1)
              : m.type === 'nt_substitution' ? 1
              : 3;
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}

/**
 * K9/V15 — check whether mutation `m` hits the AA at 1-based position `aaPos`.
 * Always numeric — never label-based.
 *
 * Replaces the previous `m.label?.includes(String(pos))` substring match,
 * which false-positived any AA whose digits appeared inside another label
 * (pos=26 matched "G26A", "R135A", "C403G", …).
 */
export function mutationHitsAA(m, aaPos) {
  if (!m) return false;
  const nt = m.codonStart ?? m.position;
  if (nt == null) return false;
  const aaStart = (aaPos - 1) * 3;
  const aaEnd = aaPos * 3;
  const span = m.type === 'insertion' || m.type === 'nt_insertion'
    ? (m.insertSequence?.length || 3)
    : m.type === 'deletion' || m.type === 'nt_deletion'
    ? (m.deletedBp || 3)
    : 3;
  return nt < aaEnd && nt + span > aaStart;
}

/**
 * K11 (Sprint 1.7) — per-nucleotide highlight map for the virtual full-view
 * of a split group. Positions come directly from the mutation list (not diff),
 * so all are conservatively marked 'nonsilent'.
 */
export function computeFullViewHighlights(fragment) {
  const map = new Map();
  const muts = fragment?.splitGroupFullParentMutations || [];
  for (const m of muts) {
    const pos = m.codonStart ?? m.position ?? m.dnaPosition ?? 0;
    const len = m.type === 'insertion' || m.type === 'nt_insertion'
      ? (m.insertSequence?.length || 3)
      : m.type === 'deletion' || m.type === 'nt_deletion'
      ? (m.deletedBp || 3)
      : 3;
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}
