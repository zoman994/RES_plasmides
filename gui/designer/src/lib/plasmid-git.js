/**
 * plasmid-git — baseSnapshot + commits[] + replay model for fragment mutations.
 *
 * Model:
 *   - fragment.baseSnapshot = { sequence, annotations } (immutable after bootstrap)
 *   - fragment.commits[] = append-journal; each commit holds absolute-parent-coords
 *     (coords in baseSnapshot.sequence), flag `applied`, createdAt timestamp.
 *   - fragment.sequence / fragment.annotations = derived via replay over applied commits.
 *
 * Semantics:
 *   - Substitution commit: delta=0, payload.newCodon (3 nt).
 *   - Deletion commit:     delta=-deleteLength, payload.deleteLength.
 *   - Insertion commit:    delta=+insertSequence.length, payload.insertSequence.
 *   - Replay applies commits in createdAt order, remapping each commit.parentPos
 *     to a current-sequence index via delta-sum over applied indels with lower parentPos.
 *   - Auto-override: a new substitution on the same codon as an applied substitution
 *     toggles the existing one to applied:false (history preserved).
 */

import { applyMutation } from '../mutagenesis';
import { CODON_TABLE } from '../codons';

// ── crypto.randomUUID feature-detect (⚓ spec §4 п.7) ──
const _hasUUID = typeof globalThis !== 'undefined'
  && globalThis.crypto
  && typeof globalThis.crypto.randomUUID === 'function';

if (!_hasUUID && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  // dev-throw so regressions in vite target surface loudly
  throw new Error('[plasmid-git] crypto.randomUUID unavailable — check Vite target config');
}

function _uuid() {
  if (_hasUUID) return globalThis.crypto.randomUUID();
  // prod fallback (should not hit under Chrome 92+)
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 0-based nucleotide → codon-start (Math.floor(pos/3)*3). */
export function codonStart(ntPos) {
  return Math.floor(ntPos / 3) * 3;
}

/** Deep-copy annotations array so baseSnapshot stays immutable. */
function cloneAnnotations(anns) {
  if (!Array.isArray(anns)) return [];
  return anns.map(a => ({ ...a }));
}

/**
 * Adjust annotation coordinates by a single delta at a given position.
 * Shifts annotations whose start > pos by delta; annotations spanning pos
 * get their end extended/trimmed. Moved from fragmentSlice.js (⚓ spec K1).
 */
export function adjustAnnotationCoords(annotations, delta, pos) {
  if (!delta) return annotations.map(a => ({ ...a }));
  return annotations.map(ann => {
    let start = ann.start;
    let end = ann.end;
    if (start > pos) start += delta;
    if (end > pos) end += delta;
    if (start < 0) start = 0;
    if (end < start) end = start;
    return { ...ann, start, end };
  });
}

/**
 * Bootstrap baseSnapshot from a fragment's current state.
 * Snapshot is deep-cloned so later fragment mutations don't leak into baseline.
 */
export function bootstrapBaseSnapshot(fragment) {
  return {
    sequence: fragment.sequence || '',
    annotations: cloneAnnotations(fragment.annotations),
  };
}

/**
 * Build a Commit object. `applied` defaults to true, `createdAt` to Date.now().
 *
 * @param {'substitution'|'deletion'|'insertion'} type
 * @param {number} parentPos — coord in baseSnapshot.sequence
 * @param {Object} payload — { newCodon } | { deleteLength } | { insertSequence }
 * @param {string} label — short human tag, e.g. "G26A"
 * @param {string} [message] — optional user note
 * @param {number} [createdAt]
 */
export function createCommit(type, parentPos, payload, label, message, createdAt) {
  return {
    id: _uuid(),
    type,
    parentPos,
    payload: { ...payload },
    label: label || '',
    message: message || undefined,
    applied: true,
    createdAt: createdAt ?? Date.now(),
  };
}

function _indelDelta(commit) {
  if (commit.type === 'deletion') return -(commit.payload.deleteLength || 0);
  if (commit.type === 'insertion') return (commit.payload.insertSequence || '').length;
  return 0;
}

/**
 * Compute current-sequence index for a commit's parentPos, given applied
 * indels with lower parentPos that were applied before this commit.
 * Deterministic: iteration in createdAt order; we pass already-sorted prior commits.
 */
function _remap(parentPos, priorApplied) {
  let total = 0;
  for (const c of priorApplied) {
    if (c.parentPos < parentPos) total += _indelDelta(c);
  }
  return parentPos + total;
}

/**
 * Replay applied commits over baseSnapshot.
 * Returns { sequence, annotations, warnings } where annotations are a deep copy
 * of baseSnapshot.annotations with coord adjustments from applied indels.
 */
export function replay(baseSnapshot, commits) {
  const warnings = [];
  let sequence = baseSnapshot?.sequence || '';
  let annotations = cloneAnnotations(baseSnapshot?.annotations);

  if (!Array.isArray(commits) || commits.length === 0) {
    return { sequence, annotations, warnings };
  }

  const active = commits
    .filter(c => c && c.applied)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const prior = [];
  let cumulativeIndel = 0;

  for (const c of active) {
    const remapped = _remap(c.parentPos, prior);
    const delta = _indelDelta(c);

    if (c.type === 'substitution') {
      const newCodon = c.payload?.newCodon;
      if (typeof newCodon === 'string' && newCodon.length === 3) {
        sequence = applyMutation(sequence, {
          type: 'substitution',
          dnaPosition: remapped,
          newCodon,
        });
      }
    } else if (c.type === 'deletion') {
      const deleteLength = c.payload?.deleteLength || 0;
      if (deleteLength > 0) {
        sequence = applyMutation(sequence, {
          type: 'deletion',
          dnaPosition: remapped,
          deleteLength,
        });
        annotations = adjustAnnotationCoords(annotations, delta, remapped);
        cumulativeIndel += delta;
      }
    } else if (c.type === 'insertion') {
      const insertSequence = c.payload?.insertSequence || '';
      if (insertSequence.length > 0) {
        sequence = applyMutation(sequence, {
          type: 'insertion',
          dnaPosition: remapped,
          insertSequence,
        });
        annotations = adjustAnnotationCoords(annotations, delta, remapped);
        cumulativeIndel += delta;
      }
    }

    prior.push(c);
  }

  if (cumulativeIndel !== 0 && cumulativeIndel % 3 !== 0) {
    warnings.push(`⚠ Сдвиг рамки: суммарный indel = ${cumulativeIndel} nt (не кратен 3).`);
  }

  return { sequence, annotations, warnings };
}

/**
 * Per-nucleotide highlight map for HEAD view after replay.
 * Substitutions: 3 Map entries at each codon's HEAD-coord with 'silent'|'nonsilent'
 * classification (CODON_TABLE lookup over baseSnapshot codon vs payload.newCodon).
 * Indels: not highlighted (fact is obvious from length change).
 *
 * @param {Object} baseSnapshot — { sequence, annotations }
 * @param {Commit[]} commits
 * @param {Array<{start,end}>} [cdsRegions] — HEAD-coord CDS/gene regions for silent classification
 * @returns {Map<number, 'silent'|'nonsilent'>}
 */
export function replayDiff(baseSnapshot, commits, cdsRegions) {
  const map = new Map();
  if (!baseSnapshot || !Array.isArray(commits) || commits.length === 0) return map;

  const baseSeq = baseSnapshot.sequence || '';
  const active = commits
    .filter(c => c && c.applied)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const prior = [];
  for (const c of active) {
    const remapped = _remap(c.parentPos, prior);

    if (c.type === 'substitution') {
      const newCodon = (c.payload?.newCodon || '').toUpperCase();
      const oldCodon = baseSeq.slice(c.parentPos, c.parentPos + 3).toUpperCase();
      let kind = 'nonsilent';
      if (oldCodon.length === 3 && newCodon.length === 3) {
        const inCDS = !cdsRegions?.length
          ? true
          : cdsRegions.some(r => c.parentPos >= r.start && c.parentPos < r.end);
        if (inCDS) {
          const fromAA = CODON_TABLE[oldCodon] || '?';
          const toAA = CODON_TABLE[newCodon] || '?';
          kind = fromAA === toAA ? 'silent' : 'nonsilent';
        }
      }
      for (let k = 0; k < 3; k++) {
        const head = remapped + k;
        const existing = map.get(head);
        // nonsilent wins over silent
        if (existing === 'nonsilent') continue;
        map.set(head, kind);
      }
    }
    // indels: skip (length change is self-evident)

    prior.push(c);
  }
  return map;
}

/**
 * For a new substitution commit, auto-toggle any currently-applied substitution
 * on the same codon to applied:false. History is preserved (commit stays in list).
 *
 * @param {Commit[]} commits — existing commits array
 * @param {Commit} newCommit — the commit about to be appended
 * @returns {{ commits: Commit[], overriddenId: string | null }}
 */
export function resolveAutoOverride(commits, newCommit) {
  if (!newCommit || newCommit.type !== 'substitution') {
    return { commits: commits.slice(), overriddenId: null };
  }
  const newCodonStart = codonStart(newCommit.parentPos);
  const existing = (commits || []).find(c =>
    c.applied
    && c.type === 'substitution'
    && codonStart(c.parentPos) === newCodonStart
  );
  if (!existing) return { commits: commits.slice(), overriddenId: null };
  return {
    commits: commits.map(c => c.id === existing.id ? { ...c, applied: false } : c),
    overriddenId: existing.id,
  };
}
