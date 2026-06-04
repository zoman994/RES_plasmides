/**
 * node-a-primer-record.test.js — Node A (V107 + WT-UX-16/17 infra).
 *
 * Unifies the assembly-primer record: both producers emit one canonical
 * shape (provenance in `source`, `bindingSequence`/`tail`, no `origin`/
 * `binding`). deriveAutoPrimers now records `source.boundaryAtOffset` for the
 * junction each primer realises, so boundary-coverage consumers
 * (selectBoundaryCoverage / getBoundaryPrimerInfo) finally see auto-primers
 * — closing V107 (counter 0/N). Pre-canon persisted primers are wiped on a
 * schema bump (v11 → v12).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { selectBoundaryCoverage } from '../store/selectors-assembly';
import { getBoundaryPrimerInfo } from '../lib/assembly-realise-suggest';
import { buildAssemblyPrimer } from '../lib/assembly-primer-utils';
import { migrateSnapshot } from '../store/skeleton-persistence';

const SRC = {
  id: 'src1', kind: 'molecule', name: 's',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};

function piece(id, start, end, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src1'],
    ranges: [{ sourceId: 'src1', start, end, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}

// Zone with two sourced pieces (0..32, 32..64) auto-grouped → deriveAutoPrimers
// runs inside CREATE_OP_GROUP and fills assemblyDraftPrimers['zn-1'].
function zoneStateWithGroup() {
  let s = buildInitialState();
  s = {
    ...s,
    containers: [...s.containers, SRC],
    zones: [{ id: 'zn-1', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [piece('pc1', 0, 32, 1), piece('pc2', 32, 64, 2)],
  };
  s = skeletonReducer(s, {
    type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'overlap_pcr', name: 'G', pieceIds: ['pc1', 'pc2'],
  });
  return s;
}

describe('Node A — canonical auto-primer record', () => {
  it('deriveAutoPrimers (via CREATE_OP_GROUP) emits the canon shape; no origin/binding', () => {
    const prs = zoneStateWithGroup().assemblyDraftPrimers['zn-1'];
    expect(prs.length).toBe(4); // fwd + rev per piece
    for (const p of prs) {
      expect(p.source.kind).toBe('auto-group');
      expect(typeof p.bindingSequence).toBe('string');
      expect(typeof p.tail).toBe('string');
      expect(typeof p.gc).toBe('number');
      expect(['forward', 'reverse']).toContain(p.direction);
      expect(p.pairId).toBeTruthy();
      expect(p.autoMode).toBe('auto');
      expect(p.status).toBe('auto');
      // old fields are gone
      expect(p.origin).toBeUndefined();
      expect(p.binding).toBeUndefined();
    }
  });

  it('fwd of piece-2 + rev of piece-1 carry source.boundaryAtOffset = the internal join', () => {
    const s = zoneStateWithGroup();
    const cov = selectBoundaryCoverage(s, 'zn-1');
    expect(cov.length).toBe(1);
    const off = cov[0].boundaryAtOffset; // join pc1|pc2 = 32
    const withOff = s.assemblyDraftPrimers['zn-1'].filter((p) => p.source.boundaryAtOffset === off);
    expect(withOff.length).toBe(2);
    expect(withOff.some((p) => p.direction === 'forward')).toBe(true);
    expect(withOff.some((p) => p.direction === 'reverse')).toBe(true);
  });

  it('selectBoundaryCoverage now sees auto-primers → internal join fwd:true rev:true (V107)', () => {
    const cov = selectBoundaryCoverage(zoneStateWithGroup(), 'zn-1');
    expect(cov.length).toBe(1);
    expect(cov[0].fwd).toBe(true);
    expect(cov[0].rev).toBe(true);
  });

  it('getBoundaryPrimerInfo sees the auto-primer; tailLength = stored tail.length', () => {
    const s = zoneStateWithGroup();
    const info = getBoundaryPrimerInfo(s, 'zn-1', 0);
    expect(info.hasPrimer).toBe(true);
    expect(info.tailLength).toBeGreaterThan(0);
    const off = selectBoundaryCoverage(s, 'zn-1')[0].boundaryAtOffset;
    // §9b one-sided overlap: the downstream fwd (with tail) and the upstream
    // rev (empty tail) both record this boundary; getBoundaryPrimerInfo reports
    // the longest-tail primer, so match that here.
    const hit = s.assemblyDraftPrimers['zn-1']
      .filter((p) => p.source.boundaryAtOffset === off)
      .reduce((best, p) => ((p.tail || '').length > (best.tail || '').length ? p : best));
    expect(info.tailLength).toBe((hit.tail || '').length);
  });

  it('REMOVE_OP_GROUP drops auto-primers by source.opGroupId', () => {
    let s = zoneStateWithGroup();
    expect(s.assemblyDraftPrimers['zn-1'].length).toBe(4);
    const og = s.operations.find((o) => o.isOpGroup);
    s = skeletonReducer(s, { type: 'REMOVE_OP_GROUP', opId: og.id });
    expect((s.assemblyDraftPrimers['zn-1'] || []).length).toBe(0);
  });
});

describe('Node A — buildAssemblyPrimer stores tail', () => {
  const seq = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp
  const boundaries = [
    { segmentId: 's0', startOnAssembly: 0, endOnAssembly: 16 },
    { segmentId: 's1', startOnAssembly: 16, endOnAssembly: 32 },
  ];

  it('junction primer → non-empty tail; single-segment → tail===""', () => {
    const junction = buildAssemblyPrimer({
      assemblySequence: seq, boundaries, range: { start: 8, end: 24 }, direction: 'forward',
    });
    expect(junction.source.kind).toBe('boundary');
    expect(junction.tail.length).toBeGreaterThan(0);
    expect(junction.sequence).toBe(junction.tail + junction.bindingSequence);

    const single = buildAssemblyPrimer({
      assemblySequence: seq, boundaries, range: { start: 2, end: 12 }, direction: 'forward',
    });
    expect(single.source.kind).toBe('segment');
    expect(single.tail).toBe('');
  });
});

describe('Node A — pre-canon primer wipe (schema bump)', () => {
  it('migrate from v11 drops the incompatible assemblyDraftPrimers map', () => {
    const old = {
      zones: [], pieces: [], operations: [],
      assemblyDraftPrimers: { z1: [{ id: 'p', binding: 'ACGT', origin: { kind: 'auto-from-group' } }] },
    };
    const migrated = migrateSnapshot(old, 11);
    expect(migrated).toBeTruthy();
    expect(migrated.assemblyDraftPrimers).toEqual({});
  });
});
