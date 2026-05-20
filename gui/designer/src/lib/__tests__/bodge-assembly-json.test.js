/**
 * K4 — assembly JSON writer + reader + cross-ref validation.
 */
import { describe, it, expect } from 'vitest';
import {
  writeAssemblyJson,
  readAssemblyJson,
  validateAssemblyJson,
  checkAssemblyOrphans,
} from '../bodge-assembly-json';

const ZONE = {
  id: 'zn01XYZABCDEF',
  name: 'pks4-knockout',
  bounds: { x: 100, y: 100, width: 800, height: 600 },
  viewMode: 'graph',
  laneLayout: 'auto',
  collapsed: false,
  notes: 'Initial pks4 ko design',
  autoResize: true,
  finalTopology: 'circular',
  createdAt: '2026-05-10T14:00:00.000Z',
  updatedAt: '2026-05-19T11:00:00.000Z',
};

const PIECES = [
  {
    id: 'pc01FRAG01',
    name: 'frag-1',
    kind: 'sourced',
    sourceIds: ['c01XYZABCDEF'],
    ranges: [{ start: 100, end: 500, strand: 1, sourceId: 'c01XYZABCDEF' }],
    origin: { kind: 'existing-primers', primerPairId: 'pp01PCR01' },
    acquisitionMethod: 'pcr',
    derivedReactionId: 'op01PCR01',
    frozen: true,
    color: '#D4A574',
    order: 0,
    pinned: false,
    zoneId: 'zn01XYZABCDEF',
  },
  {
    id: 'pc02GAP01',
    name: 'T2A linker',
    kind: 'gap',
    gapLength: 54,
    gapSequence: 'GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT',
    gapHint: 'known',
    order: 1,
    color: '#A0A0A0',
    zoneId: 'zn01XYZABCDEF',
  },
];

const OPERATIONS = [
  {
    id: 'op01PCR01',
    kind: 'pcr',
    status: 'executed',
    position: { x: 200, y: 300 },
    inputs: ['c01XYZABCDEF'],
    inputPieces: ['pc01FRAG01'],
    outputs: ['c02FRAG01-product'],
    params: { primerPairId: 'pp01PCR01', templateId: 'c01XYZABCDEF' },
    zoneId: 'zn01XYZABCDEF',
    executedAt: '2026-05-11T09:15:00.000Z',
  },
  {
    id: 'op02GIBSON01',
    kind: 'gibson',
    status: 'executed',
    inputPieces: ['pc01FRAG01', 'pc02GAP01'],
    outputs: ['c10FINAL-product'],
    zoneId: 'zn01XYZABCDEF',
    materializedClones: [
      { cloneId: 'c11CLONE01', label: 'clone-1', sangerVerified: 'verified', notes: 'ok' },
      { cloneId: 'c12CLONE02', label: 'clone-2', sangerVerified: 'failed', notes: 'C234T' },
    ],
  },
];

const JUNCTIONS = [
  { id: 'jn01', kind: 'gibson', leftPieceId: 'pc01FRAG01', rightPieceId: 'pc02GAP01', overlapLength: 25 },
];

const POSITIONS = { pc01FRAG01: { x: 150, y: 250 } };

describe('K4 — writeAssemblyJson', () => {
  it('serializes a zone + pieces + operations + junctions to parseable JSON', () => {
    const s = writeAssemblyJson({
      zone: ZONE, pieces: PIECES, operations: OPERATIONS, junctions: JUNCTIONS, positions: POSITIONS,
    });
    const parsed = JSON.parse(s);
    expect(parsed.id).toBe(ZONE.id);
    expect(parsed.name).toBe('pks4-knockout');
    expect(parsed.zone.viewMode).toBe('graph');
    expect(parsed.zone.finalTopology).toBe('circular');
    expect(parsed.pieces).toHaveLength(2);
    expect(parsed.operations).toHaveLength(2);
    expect(parsed.junctions).toHaveLength(1);
    expect(parsed.fileFormatVersion).toBe('2.0.0');
  });

  it('preserves gap-piece sequence (V83 invariant)', () => {
    const s = writeAssemblyJson({ zone: ZONE, pieces: PIECES });
    const parsed = JSON.parse(s);
    const gap = parsed.pieces.find(p => p.kind === 'gap');
    expect(gap.gapSequence).toBe('GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT');
    expect(gap.gapHint).toBe('known');
  });

  it('preserves materializedClones array on Gibson op (T9)', () => {
    const s = writeAssemblyJson({ zone: ZONE, operations: OPERATIONS });
    const parsed = JSON.parse(s);
    const gibson = parsed.operations.find(o => o.kind === 'gibson');
    expect(gibson.materializedClones).toHaveLength(2);
    expect(gibson.materializedClones[0].sangerVerified).toBe('verified');
  });

  it('throws on missing zone or zone.id', () => {
    expect(() => writeAssemblyJson({})).toThrow(/zone/);
    expect(() => writeAssemblyJson({ zone: {} })).toThrow(/zone/);
  });

  it('drops unknown runtime cruft from pieces/operations', () => {
    const dirtyPiece = { ...PIECES[0], _runtime: { foo: 'bar' }, junk: 123 };
    const s = writeAssemblyJson({ zone: ZONE, pieces: [dirtyPiece] });
    const parsed = JSON.parse(s);
    expect(parsed.pieces[0]._runtime).toBeUndefined();
    expect(parsed.pieces[0].junk).toBeUndefined();
    expect(parsed.pieces[0].id).toBe(dirtyPiece.id);
  });
});

describe('K4 — readAssemblyJson', () => {
  it('round-trips the assembly losslessly', () => {
    const s = writeAssemblyJson({
      zone: ZONE, pieces: PIECES, operations: OPERATIONS, junctions: JUNCTIONS, positions: POSITIONS,
    });
    const back = readAssemblyJson(s);
    expect(back.id).toBe(ZONE.id);
    expect(back.zone.viewMode).toBe('graph');
    expect(back.pieces).toHaveLength(2);
    expect(back.pieces[0].id).toBe('pc01FRAG01');
    expect(back.junctions[0].id).toBe('jn01');
    expect(back.positions.pc01FRAG01.x).toBe(150);
  });

  it('accepts a pre-parsed object as well as a string', () => {
    const s = writeAssemblyJson({ zone: ZONE, pieces: PIECES });
    const back = readAssemblyJson(JSON.parse(s));
    expect(back.id).toBe(ZONE.id);
  });

  it('throws on missing id', () => {
    expect(() => readAssemblyJson('{}')).toThrow(/assembly id/);
  });
});

describe('K4 — cross-ref validation', () => {
  const containerIds = new Set(['c01XYZABCDEF', 'c02FRAG01-product', 'c10FINAL-product',
    'c11CLONE01', 'c12CLONE02']);
  const pieceIds = new Set(PIECES.map(p => p.id));
  const opIds = new Set(OPERATIONS.map(o => o.id));

  const fullAssembly = readAssemblyJson(writeAssemblyJson({
    zone: ZONE, pieces: PIECES, operations: OPERATIONS, junctions: JUNCTIONS,
  }));

  it('passes when all refs resolve', () => {
    const r = validateAssemblyJson(fullAssembly, { containerIds, pieceIds, opIds });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('fails on orphan piece.sourceIds', () => {
    const broken = readAssemblyJson(writeAssemblyJson({ zone: ZONE, pieces: PIECES }));
    const r = validateAssemblyJson(broken, { containerIds: new Set(), pieceIds, opIds });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /sourceId/.test(e))).toBe(true);
  });

  it('fails on orphan op.inputs', () => {
    const r = validateAssemblyJson(fullAssembly, {
      containerIds: new Set(['c01XYZABCDEF']), pieceIds, opIds,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /unknown container/.test(e))).toBe(true);
  });

  it('fails on orphan junction piece refs', () => {
    const broken = readAssemblyJson(writeAssemblyJson({ zone: ZONE, junctions: JUNCTIONS }));
    const r = validateAssemblyJson(broken, { containerIds, pieceIds: new Set(), opIds });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /junction/.test(e))).toBe(true);
  });

  it('fails on orphan materializedClones cloneId', () => {
    const broken = readAssemblyJson(writeAssemblyJson({ zone: ZONE, operations: OPERATIONS }));
    const r = validateAssemblyJson(broken, {
      containerIds: new Set(['c01XYZABCDEF', 'c02FRAG01-product', 'c10FINAL-product']),
      pieceIds, opIds,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /clone/.test(e))).toBe(true);
  });

  it('checkAssemblyOrphans returns warnings (soft) — reader-side', () => {
    const warnings = checkAssemblyOrphans(fullAssembly, {
      containerIds: new Set(['c01XYZABCDEF']),
      pieceIds,
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every(w => /orphan/.test(w))).toBe(true);
  });

  it('passes orphan-check when all containers known', () => {
    const warnings = checkAssemblyOrphans(fullAssembly, { containerIds, pieceIds });
    expect(warnings).toEqual([]);
  });
});
