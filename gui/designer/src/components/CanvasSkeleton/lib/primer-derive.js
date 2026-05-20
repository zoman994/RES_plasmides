/**
 * primer-derive — M-CANVAS-WORKFLOW-UX K11 (SPEC §3 шаг 3 / §5).
 *
 * deriveAutoPrimers(opGroup, state) → Primer[]
 *
 * Pure. For each amplifiable piece in the group (sourced / synthesis /
 * intermediate) produces one fwd + one rev primer. Snippet and gap
 * pieces are skipped — snippet sequences instead embed into the
 * neighbouring amplifiable piece's fwd-primer tail (SPEC §5.1: «обвес
 * встраивается в праймер»). Mutations on a sourced piece are applied
 * to the local piece sequence before binding extraction — so the
 * derived primer is mutagenic.
 *
 * Biology note: spec §3 buildLeftTail wraps `reverseComplement(prevSeq
 * .slice(-25))` for ovPCR/gibson, but that is a spec bug — the fwd
 * primer extends the 5' on the TOP strand, so its tail in 5'→3' must
 * be the prev piece's last 25 nt VERBATIM (no RC). bio-invariants
 * enforce this. Rev primer tail IS reverse-complemented (it lies on
 * the bottom strand).
 */
import { v7 as uuidv7 } from 'uuid';
import { reverseComplement } from '../../../sequence-utils';

const BINDING_LEN = 20;
const OVERLAP_LEN = 25;
const SKIPPED_KINDS = new Set(['snippet', 'gap']);

/** Get the top-strand sequence of a piece, applying any mutations. */
function pieceSequence(piece, state) {
  if (!piece) return '';
  if (piece.kind === 'sourced') {
    const r = piece.ranges && piece.ranges[0];
    if (!r) return '';
    const c = ((state && state.containers) || []).find((x) => x && x.id === r.sourceId);
    if (!c) return '';
    const raw = String(c.sequence || '').slice(r.start, r.end);
    let seq = r.orientation === 'reverse' ? reverseComplement(raw) : raw;
    // K14 mutagenic primer support — overwrite position-by-position.
    if (Array.isArray(piece.mutations) && piece.mutations.length > 0) {
      const arr = seq.split('');
      for (const m of piece.mutations) {
        if (Number.isFinite(m.position) && m.position >= 0 && m.position < arr.length
            && typeof m.toBase === 'string' && m.toBase.length === 1) {
          arr[m.position] = m.toBase.toUpperCase();
        }
      }
      seq = arr.join('');
    }
    return seq;
  }
  return String(piece.sequence || '');
}

/** Wallace approximation — enough for an auto-derived placeholder; the
 *  biolog can edit the primer in K13 which uses the full NN model. */
function tmEstimate(binding) {
  const s = String(binding || '').toUpperCase();
  let gc = 0;
  let at = 0;
  for (const ch of s) {
    if (ch === 'G' || ch === 'C') gc += 1;
    else if (ch === 'A' || ch === 'T') at += 1;
  }
  return 4 * gc + 2 * at;
}

function buildFwdTail(opGroup, logicalPrev, leftSnippetSeq, state) {
  const kind = opGroup && opGroup.kind;
  // No logical-prev: only the accumulated snippet content (group starts
  // with a snippet ⇒ first amplifiable piece carries it on its tail).
  if (!logicalPrev) return leftSnippetSeq;

  if (kind === 'overlap_pcr' || kind === 'gibson') {
    const prevSeq = pieceSequence(logicalPrev, state);
    return prevSeq.slice(-OVERLAP_LEN) + leftSnippetSeq;
  }
  if (kind === 'golden_gate') {
    return `GGTCTCN${logicalPrev.ggOverhang || 'AAAA'}${leftSnippetSeq}`;
  }
  if (kind === 'restriction') {
    return `${logicalPrev.reSite || ''}GG${leftSnippetSeq}`;
  }
  // kld / direct_ligation / unknown → no overlap tail.
  return leftSnippetSeq;
}

function buildRevTail(opGroup, piece, logicalNext, state) {
  const kind = opGroup && opGroup.kind;
  if (!logicalNext) return '';
  if (kind === 'overlap_pcr' || kind === 'gibson') {
    const nextSeq = pieceSequence(logicalNext, state);
    return reverseComplement(nextSeq.slice(0, OVERLAP_LEN));
  }
  if (kind === 'golden_gate') {
    return reverseComplement(`GGTCTCN${piece.ggOverhang || 'AAAA'}`);
  }
  if (kind === 'restriction') {
    return reverseComplement(`${piece.reSite || ''}GG`);
  }
  return '';
}

function makePrimer({
  opGroupId, piece, side, tail, binding, mutated, pieceIndex1,
}) {
  return {
    id: `pr-${uuidv7()}`,
    name: `asm-${side}-${pieceIndex1}`,
    sequence: `${tail}${binding}`,
    binding,
    tail,
    tm: tmEstimate(binding),
    autoMode: 'auto',
    mutated: !!mutated,
    origin: {
      kind: 'auto-from-group',
      opGroupId,
      pieceId: piece.id,
      side,
    },
  };
}

export function deriveAutoPrimers(opGroup, state) {
  if (!opGroup || !Array.isArray(opGroup.inputPieces) || opGroup.inputPieces.length === 0) {
    return [];
  }
  const all = (state && state.pieces) || [];
  const pieces = opGroup.inputPieces.map((id) => all.find((p) => p && p.id === id));
  const primers = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (!piece || SKIPPED_KINDS.has(piece.kind)) continue;

    // Walk LEFT through snippets to the first non-snippet (logical-prev),
    // collecting snippet sequences in 5'→3' top-strand order.
    const leftSnippets = [];
    let logicalPrev = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const p = pieces[j];
      if (!p) continue;
      if (p.kind === 'snippet' && p.embedsInPrimer !== false) {
        leftSnippets.unshift(String(p.sequence || ''));
        continue;
      }
      if (p.kind === 'gap') break; // gap walls the tail walk
      logicalPrev = p;
      break;
    }

    // Walk RIGHT for the logical-next non-snippet piece. The snippet
    // content is NOT duplicated on this piece's rev tail — it lives
    // only on the NEXT piece's fwd tail (SPEC §5.1).
    let logicalNext = null;
    for (let j = i + 1; j < pieces.length; j += 1) {
      const p = pieces[j];
      if (!p) continue;
      if (p.kind === 'snippet' && p.embedsInPrimer !== false) continue;
      if (p.kind === 'gap') break;
      logicalNext = p;
      break;
    }

    const fullSeq = pieceSequence(piece, state);
    const mutated = Array.isArray(piece.mutations) && piece.mutations.length > 0;
    const fwdBinding = fullSeq.slice(0, BINDING_LEN);
    const revBinding = reverseComplement(fullSeq.slice(-BINDING_LEN));

    const fwdTail = buildFwdTail(opGroup, logicalPrev, leftSnippets.join(''), state);
    const revTail = buildRevTail(opGroup, piece, logicalNext, state);

    const pieceIndex1 = i + 1;
    primers.push(makePrimer({
      opGroupId: opGroup.id, piece, side: 'fwd',
      tail: fwdTail, binding: fwdBinding, mutated, pieceIndex1,
    }));
    primers.push(makePrimer({
      opGroupId: opGroup.id, piece, side: 'rev',
      tail: revTail, binding: revBinding, mutated, pieceIndex1,
    }));
  }
  return primers;
}
