/**
 * zone-assembly-write-adapter.test.js — T6 K8.
 *
 * routeAssemblyWriteToZone(state, action) — when an ASSEMBLY_* write
 * action targets a ZONE id (not a legacy draft) it is translated to
 * piece/zone mutations (delegating to piecesReducer for piece
 * semantics + invariants). Returns `undefined` for legacy-draft ids so
 * assemblyReducer falls through to its original logic (R-T6-4).
 *
 * segment.id === piece.id (draftFromZone), so segment ops address
 * pieces directly.
 */
import { describe, it, expect } from 'vitest';
import { routeAssemblyWriteToZone } from '../lib/zone-assembly-write-adapter';
import { piecesReducer } from '../store/skeleton-state-pieces';
import { selectZoneAsDraftLike } from '../store/selectors-pieces';

const C = {
  id: 'cZ', name: 'pUC', kind: 'molecule',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [],
};

function piece(id, start, end, orientation, createdAt) {
  return {
    id,
    kind: 'sourced',
    name: id,
    sourceIds: ['cZ'],
    ranges: [{ sourceId: 'cZ', start, end, orientation: orientation || 'forward' }],
    origin: 'selection',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
    functionalLabel: null,
    color: '#abcdef',
    zoneId: 'zn-1',
    derivedReactionId: null,
    frozen: false,
    createdAt,
    updatedAt: createdAt,
  };
}

function zoneState(pieces) {
  return {
    containers: [C],
    operations: [],
    junctions: [],
    assemblyDrafts: [],
    zones: [{
      id: 'zn-1', name: 'Z', viewMode: 'sequence',
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces,
  };
}

const ordered = (s) => selectZoneAsDraftLike(s, 'zn-1').segments;

describe('T6 K8 — routeAssemblyWriteToZone', () => {
  it('legacy draft id → undefined (falls through to assemblyReducer)', () => {
    const s = { ...zoneState([]), assemblyDrafts: [{ id: 'asm', segments: [] }] };
    expect(routeAssemblyWriteToZone(s, {
      type: 'REMOVE_SEGMENT', draftId: 'asm', segmentId: 'x',
    })).toBeUndefined();
  });

  it('non-assembly action → undefined', () => {
    expect(routeAssemblyWriteToZone(zoneState([]), { type: 'FOO' })).toBeUndefined();
  });

  it('REMOVE_SEGMENT → REMOVE_PIECE on the zone', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1), piece('pcB', 8, 16, 'forward', 2)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'REMOVE_SEGMENT', draftId: 'zn-1', segmentId: 'pcA',
    });
    expect(next.pieces.map((p) => p.id)).toEqual(['pcB']);
  });

  it('REORDER_SEGMENTS swaps piece order (createdAt reassign)', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1), piece('pcB', 8, 16, 'forward', 2)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'REORDER_SEGMENTS', draftId: 'zn-1', fromIndex: 0, toIndex: 1,
    });
    expect(ordered(next).map((sg) => sg.id)).toEqual(['pcB', 'pcA']);
  });

  it('UPDATE_SEGMENT label → piece.name (segment.label projection)', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'UPDATE_SEGMENT', draftId: 'zn-1', segmentId: 'pcA', patch: { label: 'promoter' },
    });
    expect(next.pieces[0].name).toBe('promoter');
    expect(ordered(next)[0].label).toBe('promoter');
  });

  it('UPDATE_SEGMENT color → SET_PIECE_COLOR', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'UPDATE_SEGMENT', draftId: 'zn-1', segmentId: 'pcA', patch: { color: '#123456' },
    });
    expect(next.pieces[0].color).toBe('#123456');
  });

  it('UPDATE_SEGMENT source:{type:manual} → converts piece to a gap', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'UPDATE_SEGMENT', draftId: 'zn-1', segmentId: 'pcA', patch: { source: { type: 'manual' } },
    });
    expect(next.pieces[0].kind).toBe('gap');
    expect(next.pieces[0].gapLength).toBe(8); // former sourced length
    expect(ordered(next)[0].source.type).toBe('manual');
  });

  it('UPDATE_SEGMENT_RANGE re-slices the piece range', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'UPDATE_SEGMENT_RANGE', draftId: 'zn-1', segmentId: 'pcA', start: 4, end: 12,
    });
    expect(next.pieces[0].ranges[0]).toMatchObject({ start: 4, end: 12 });
    expect(ordered(next)[0].sequence).toBe('CCCCGGGG'); // cZ[4:12]
  });

  it('TOGGLE_SEGMENT_RC flips orientation + reconstructed RC sequence', () => {
    const s = zoneState([piece('pcA', 0, 4, 'forward', 1)]); // AAAA
    const next = routeAssemblyWriteToZone(s, {
      type: 'TOGGLE_SEGMENT_RC', draftId: 'zn-1', segmentId: 'pcA',
    });
    expect(next.pieces[0].ranges[0].orientation).toBe('reverse');
    expect(ordered(next)[0].sequence).toBe('TTTT'); // RC(AAAA)
  });

  it('RENAME_ASSEMBLY_DRAFT → zone name', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'RENAME_ASSEMBLY_DRAFT', draftId: 'zn-1', name: 'My Build',
    });
    expect(next.zones[0].name).toBe('My Build');
  });

  it('SET_ASSEMBLY_DRAFT_TOPOLOGY on a zone → no-op state (documented deviation)', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'SET_ASSEMBLY_DRAFT_TOPOLOGY', draftId: 'zn-1', circular: true,
    });
    expect(next).toBe(s); // unchanged, but consumed (not undefined)
  });

  it('INSERT_SEGMENT → a sourced piece assigned to the zone', () => {
    const s = zoneState([]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'INSERT_SEGMENT', draftId: 'zn-1', sourceContainerId: 'cZ', start: 0, end: 8, rc: false,
    });
    expect(next.pieces).toHaveLength(1);
    expect(next.pieces[0].zoneId).toBe('zn-1');
    expect(next.pieces[0].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 8, orientation: 'forward' });
  });

  it('INSERT_MANUAL_SEGMENT → a gap piece in the zone', () => {
    const s = zoneState([]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'zn-1', length: 20, gapKind: 'unknown',
    });
    expect(next.pieces).toHaveLength(1);
    expect(next.pieces[0].kind).toBe('gap');
    expect(next.pieces[0].gapLength).toBe(20);
    expect(next.pieces[0].zoneId).toBe('zn-1');
  });

  it('REMOVE_SEGMENT for a missing piece → state unchanged but consumed', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const next = routeAssemblyWriteToZone(s, {
      type: 'REMOVE_SEGMENT', draftId: 'zn-1', segmentId: 'GONE',
    });
    expect(next.pieces).toHaveLength(1);
  });

  it('delegates piece semantics — REMOVE_PIECE via piecesReducer parity', () => {
    const s = zoneState([piece('pcA', 0, 8, 'forward', 1)]);
    const viaAdapter = routeAssemblyWriteToZone(s, {
      type: 'REMOVE_SEGMENT', draftId: 'zn-1', segmentId: 'pcA',
    });
    const viaPieces = piecesReducer(s, { type: 'REMOVE_PIECE', pieceId: 'pcA' });
    expect(viaAdapter.pieces).toEqual(viaPieces.pieces);
  });
});
