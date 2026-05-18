/**
 * segment-to-piece-adapter.test.js — T6 K1. Adapter between the legacy
 * assembly-model Segment shape (source:{type,containerId} +
 * reverseComplement) and the 4-tier Piece shape. NOTE: spec §5.1
 * pseudo-code used segment.kind/sourceContainerId/orientation — the
 * REAL shape (assembly-model.js makeSourcedSegment/makeManualSegment)
 * is source.{type,containerId} + reverseComplement; adapter follows
 * reality.
 */
import { describe, it, expect } from 'vitest';
import {
  segmentToPieceData, pieceToSegmentShape,
  zonePiecesAsAssemblyDraft, computeAssemblySequenceFromPieces,
} from '../lib/segment-to-piece-adapter';

const C = { id: 'c-1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT' };
const sourced = (over = {}) => ({
  id: 'seg-1', source: { type: 'container', containerId: 'c-1', sourceContainerName: 'pUC' },
  start: 4, end: 8, reverseComplement: false, sequence: 'CCCC', length: 4,
  color: '#abc', label: undefined, annotations: [], ...over,
});
const manualGap = (over = {}) => ({
  id: 'seg-g', source: { type: 'manual' }, reverseComplement: false,
  sequence: '', length: 12, color: '#def', gapKind: 'linker', gapLabel: 'GS', annotations: [], ...over,
});

describe('T6 K1 segmentToPieceData', () => {
  it('sourced segment → sourced piece data (forward)', () => {
    const p = segmentToPieceData(sourced(), C);
    expect(p.kind).toBe('sourced');
    expect(p.sourceIds).toEqual(['c-1']);
    expect(p.ranges).toEqual([{ sourceId: 'c-1', start: 4, end: 8, orientation: 'forward' }]);
    expect(p.origin).toBe('legacy-migration');
  });
  it('reverseComplement → orientation reverse', () => {
    expect(segmentToPieceData(sourced({ reverseComplement: true }), C).ranges[0].orientation).toBe('reverse');
  });
  it('manual (empty seq) → gap piece', () => {
    const p = segmentToPieceData(manualGap(), null);
    expect(p.kind).toBe('gap');
    expect(p.sourceIds).toEqual([]);
    expect(p.ranges).toEqual([]);
    expect(p.gapLength).toBe(12);
    expect(p.gapHint).toBe('linker');
    expect(p.origin).toBe('manual-gap');
    expect(p.functionalLabel).toBe('gap');
  });
});

describe('T6 K1 pieceToSegmentShape (round-trip)', () => {
  it('sourced piece → segment-like preserving source/range/orientation', () => {
    const pd = segmentToPieceData(sourced({ reverseComplement: true }), C);
    const piece = { id: 'pc-1', color: '#xyz', ...pd };
    const seg = pieceToSegmentShape(piece);
    expect(seg.source).toEqual({ type: 'container', containerId: 'c-1' });
    expect(seg.start).toBe(4);
    expect(seg.end).toBe(8);
    expect(seg.reverseComplement).toBe(true);
  });
  it('gap piece → manual segment-like with length/gapKind', () => {
    const piece = { id: 'pc-g', kind: 'gap', gapLength: 12, gapHint: 'linker', name: 'Гэп 12 нт' };
    const seg = pieceToSegmentShape(piece);
    expect(seg.source).toEqual({ type: 'manual' });
    expect(seg.length).toBe(12);
    expect(seg.gapKind).toBe('linker');
    expect(seg.sequence).toBe('');
  });
});

describe('T6 K1 zonePiecesAsAssemblyDraft / computeAssemblySequenceFromPieces', () => {
  const state = {
    zones: [{ id: 'zn-1', name: 'Сборка', bounds: { x: 10, y: 20, width: 600, height: 400 } }],
    containers: [C],
    junctions: [],
    pieces: [
      { id: 'pc-a', kind: 'sourced', zoneId: 'zn-1', createdAt: 1, sourceIds: ['c-1'], ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }] },
      { id: 'pc-g', kind: 'gap', zoneId: 'zn-1', createdAt: 2, gapLength: 3, gapHint: 'unknown' },
      { id: 'pc-b', kind: 'sourced', zoneId: 'zn-1', createdAt: 3, sourceIds: ['c-1'], ranges: [{ sourceId: 'c-1', start: 4, end: 8, orientation: 'reverse' }] },
    ],
  };
  it('zonePiecesAsAssemblyDraft shims a draft-like view ordered by createdAt', () => {
    const d = zonePiecesAsAssemblyDraft(state, 'zn-1');
    expect(d.id).toBe('zn-1');
    expect(d.segments.map((s) => s.id)).toEqual(['pc-a', 'pc-g', 'pc-b']);
    expect(d.position).toEqual({ x: 10, y: 20 });
  });
  it('computeAssemblySequenceFromPieces concats sourced slices + N×gap', () => {
    // pc-a: AAAA ; pc-g: NNN ; pc-b: revcomp(CCCC)=GGGG
    expect(computeAssemblySequenceFromPieces(state.pieces, state)).toBe('AAAANNNGGGG');
  });
  it('unknown zone → null draft', () => {
    expect(zonePiecesAsAssemblyDraft(state, 'zn-x')).toBeNull();
  });
});
