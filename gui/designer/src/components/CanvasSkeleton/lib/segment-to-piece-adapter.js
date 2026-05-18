/**
 * segment-to-piece-adapter — T6 K1 (DEC-T6-01/07). Pure bridge between
 * the legacy assembly-model Segment shape and the 4-tier Piece shape.
 *
 * REAL segment shape (assembly-model.js, verified): sourced =
 * { source:{type:'container',containerId}, start, end, reverseComplement,
 *   sequence, length, label }; gap = manual segment with empty
 * sequence + length + gapKind. (Spec §5.1 pseudo used
 * kind/sourceContainerId/orientation — wrong; this follows reality.)
 */
import { autoPieceName } from './piece-model';
import { reverseComplement } from '../../../sequence-utils';

/** Segment (legacy) → partial pieceData (id/color/timestamps added by reducer). */
export function segmentToPieceData(segment, container) {
  const type = segment && segment.source && segment.source.type;
  const isGap = type === 'manual' || type === 'imported'
    || !segment.source || !segment.source.containerId;
  if (isGap) {
    // V83 — a legacy manual segment that carries a real sequence
    // (linker/custom) migrates as a known gap, not a poly-N placeholder.
    const gseq = (typeof segment.sequence === 'string' && segment.sequence.length > 0)
      ? segment.sequence : '';
    return {
      kind: 'gap',
      name: `Гэп ${gseq ? gseq.length : (segment.length || 0)} нт`,
      sourceIds: [],
      ranges: [],
      gapLength: gseq ? gseq.length : (segment.length || 0),
      gapHint: gseq ? 'known' : (segment.gapKind || 'unknown'),
      ...(gseq ? { gapSequence: gseq } : {}),
      origin: 'manual-gap',
      acquisitionMethod: 'synthesis',
      acquisitionParams: { type: 'manual-gap' },
      functionalLabel: 'gap',
    };
  }
  const cid = segment.source.containerId;
  return {
    kind: 'sourced',
    name: segment.label
      || autoPieceName(container || { name: segment.source.sourceContainerName || '' },
        { start: segment.start, end: segment.end }),
    sourceIds: [cid],
    ranges: [{
      sourceId: cid,
      start: segment.start,
      end: segment.end,
      orientation: segment.reverseComplement ? 'reverse' : 'forward',
    }],
    origin: 'legacy-migration',
    acquisitionMethod: segment.acquisitionMethod || 'undefined',
    acquisitionParams: segment.acquisitionParams || {},
    functionalLabel: segment.label || null,
  };
}

/** Piece (4-tier) → segment-like shape for legacy consumers (RealiseModal). */
export function pieceToSegmentShape(piece) {
  if (piece.kind === 'gap') {
    // V83 — known gap keeps its DNA; '' = genuine poly-N placeholder.
    const gseq = (typeof piece.gapSequence === 'string' && piece.gapSequence.length > 0)
      ? piece.gapSequence : '';
    return {
      id: piece.id,
      source: { type: 'manual' },
      reverseComplement: false,
      sequence: gseq,
      length: gseq ? gseq.length : (piece.gapLength || 0),
      gapKind: gseq ? 'known' : (piece.gapHint || 'unknown'),
      name: piece.name,
    };
  }
  const r = (piece.ranges && piece.ranges[0]) || { sourceId: undefined, start: 0, end: 0 };
  return {
    id: piece.id,
    source: { type: 'container', containerId: r.sourceId },
    start: r.start,
    end: r.end,
    reverseComplement: r.orientation === 'reverse',
    name: piece.name,
    color: piece.color,
    acquisitionMethod: piece.acquisitionMethod,
    acquisitionParams: piece.acquisitionParams,
    functionalLabel: piece.functionalLabel,
  };
}

/** All pieces in a zone as a draft-like object (ordered by createdAt). */
export function zonePiecesAsAssemblyDraft(state, zoneId) {
  const zone = ((state && state.zones) || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  const pieces = ((state && state.pieces) || [])
    .filter((p) => p.zoneId === zoneId)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return {
    id: zone.id,
    name: zone.name,
    segments: pieces.map(pieceToSegmentShape),
    position: zone.bounds ? { x: zone.bounds.x, y: zone.bounds.y } : { x: 0, y: 0 },
    realiseRevision: 0,
    lastRealisedAt: null,
  };
}

/** Assembly sequence from pieces — sourced slices (RC on reverse) + N×gap. */
export function computeAssemblySequenceFromPieces(pieces, state) {
  const containers = (state && state.containers) || [];
  let seq = '';
  for (const piece of pieces || []) {
    if (piece.kind === 'gap') {
      // V83 — known gap → its real sequence; sequence-less → poly-N.
      seq += (typeof piece.gapSequence === 'string' && piece.gapSequence.length > 0)
        ? piece.gapSequence
        : 'N'.repeat(piece.gapLength || 0);
      continue;
    }
    for (const r of piece.ranges || []) {
      const c = containers.find((x) => x.id === r.sourceId);
      if (!c) continue;
      const slice = String(c.sequence || '').slice(r.start, r.end);
      seq += r.orientation === 'reverse' ? reverseComplement(slice) : slice;
    }
  }
  return seq;
}
