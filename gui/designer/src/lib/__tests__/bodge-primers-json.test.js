/**
 * K5 — primer pool JSON + sequence-hash dedup.
 *
 * MANDATORY REGRESSION TEST (spec §8.1 behavior change vs v1):
 *   v1 merged by id. v2 merges by normalized-sequence-hash. Two .bodge
 *   files with identical primer sequence under different ids land as
 *   ONE pool entry with origin extended to multi-project.
 */
import { describe, it, expect } from 'vitest';
import {
  writePrimerPool,
  readPrimerPool,
  indexPrimerPoolByHash,
} from '../bodge-primers-json';

// PRIMER-AUDIT (V174) — a tailed primer must survive .bodge round-trip with its
// bindingSequence + tail + direction + status, else PrimerTrack loses the overhang
// and binding-search matches the full oligo after reload.
describe('serializePrimer — V173 shape round-trip (bindingSequence/tail/direction)', () => {
  it('preserves bindingSequence, tail, direction, status, tags through write→read', async () => {
    const tailed = {
      id: 'pp01TAILED1',
      name: 'BamHI-fwd',
      sequence: 'GGATCCACGTACGTACGT',
      bindingSequence: 'ACGTACGTACGT',
      tail: 'GGATCC',
      direction: 'forward',
      status: 'ordered',
      tm: 55,
      tags: ['колония'],
      origin: { kind: 'library-selection', projectId: 'p01PROJ-A' },
    };
    const json = writePrimerPool([tailed], 'p01PROJ-A');
    const { pool } = await readPrimerPool(json, []);
    const got = pool.find((p) => p.id === 'pp01TAILED1');
    expect(got.bindingSequence).toBe('ACGTACGTACGT');
    expect(got.tail).toBe('GGATCC');
    expect(got.direction).toBe('forward');
    expect(got.status).toBe('ordered');
    expect(got.tags).toEqual(['колония']);
  });
});

const PROJECT_A = 'p01PROJ-A';
const PROJECT_B = 'p01PROJ-B';

const PRIMER_T7_FWD = {
  id: 'pp01PRMR01',
  name: 'T7-fwd',
  sequence: 'ATACGACTCACTATAGGGGAATTGTGAGCGGATAAC',
  tm: 60.2,
  origin: { kind: 'library-selection', projectId: PROJECT_A, containerId: 'c01XYZ' },
  tags: ['T7'],
  boundContainers: [{ containerId: 'c01XYZ', bindStart: 17, bindEnd: 51, strand: 1 }],
};

const PRIMER_T7_FWD_DIFFERENT_ID = {
  ...PRIMER_T7_FWD,
  id: 'pp01ALTID42',
  origin: { kind: 'library-selection', projectId: PROJECT_B, containerId: 'c99' },
  boundContainers: [{ containerId: 'c99', bindStart: 5, bindEnd: 41, strand: 1 }],
};

const PRIMER_T7_REV = {
  id: 'pp01PRMR02',
  name: 'T7-rev',
  sequence: 'GCTAGTTATTGCTCAGCGG',
  tm: 57.0,
  origin: { kind: 'library-selection', projectId: PROJECT_A, containerId: 'c01XYZ' },
};

const PAIR_T7 = {
  id: 'pp01PAIR01',
  kind: 'pair',
  forwardId: PRIMER_T7_FWD.id,
  reverseId: PRIMER_T7_REV.id,
  name: 'T7 pair',
  ampliconLength: 360,
};

describe('K5 — writePrimerPool', () => {
  it('serializes singles + pairs', () => {
    const s = writePrimerPool([PRIMER_T7_FWD, PRIMER_T7_REV, PAIR_T7], PROJECT_A);
    const parsed = JSON.parse(s);
    expect(parsed.projectId).toBe(PROJECT_A);
    expect(parsed.primers).toHaveLength(3);
    expect(parsed.primers[2].kind).toBe('pair');
    expect(parsed.primers[0].sequence).toBe(PRIMER_T7_FWD.sequence);
  });

  it('throws on non-array primers / missing projectId', () => {
    expect(() => writePrimerPool('not-array', PROJECT_A)).toThrow(/primers/);
    expect(() => writePrimerPool([], '')).toThrow(/projectId/);
  });
});

describe('K5 — readPrimerPool dedup', () => {
  it('first import: adds all primers fresh', async () => {
    const s = writePrimerPool([PRIMER_T7_FWD, PRIMER_T7_REV], PROJECT_A);
    const r = await readPrimerPool(s, []);
    expect(r.pool).toHaveLength(2);
    expect(r.mergedCount).toBe(2);
    expect(r.dedupCount).toBe(0);
  });

  it('regression §8.1: identical sequence different id → one pool entry, multi-project origin', async () => {
    const fileA = writePrimerPool([PRIMER_T7_FWD], PROJECT_A);
    const fileB = writePrimerPool([PRIMER_T7_FWD_DIFFERENT_ID], PROJECT_B);
    const r1 = await readPrimerPool(fileA, []);
    const r2 = await readPrimerPool(fileB, r1.pool);
    expect(r2.pool).toHaveLength(1); // ONE entry, not two.
    expect(r2.dedupCount).toBe(1);
    expect(r2.mergedCount).toBe(0);
    const merged = r2.pool[0];
    expect(merged.origin.kind).toBe('multi-project');
    expect(merged.origin.sources).toHaveLength(2);
    expect(merged.origin.sources.map(s => s.projectId).sort())
      .toEqual([PROJECT_A, PROJECT_B].sort());
    expect(merged.id).toBe(PRIMER_T7_FWD.id); // First-write id wins.
  });

  it('case-insensitive sequence comparison (uppercase vs lowercase)', async () => {
    const fileA = writePrimerPool([{ ...PRIMER_T7_FWD, sequence: 'atacgactcactataggggaattgtgagcggataac' }], PROJECT_A);
    const fileB = writePrimerPool([PRIMER_T7_FWD], PROJECT_B);
    const r1 = await readPrimerPool(fileA, []);
    const r2 = await readPrimerPool(fileB, r1.pool);
    expect(r2.pool).toHaveLength(1);
    expect(r2.dedupCount).toBe(1);
  });

  it('warns on no-sequence primer instead of crashing', async () => {
    const noSeq = { id: 'pp99', name: 'broken', sequence: '' };
    const s = writePrimerPool([noSeq], PROJECT_A);
    const r = await readPrimerPool(s, []);
    expect(r.pool).toHaveLength(0);
    expect(r.warnings.some(w => /pp99/.test(w))).toBe(true);
  });

  it('pairs pass through without dedup', async () => {
    const file = writePrimerPool([PRIMER_T7_FWD, PRIMER_T7_REV, PAIR_T7], PROJECT_A);
    const r = await readPrimerPool(file, []);
    expect(r.pool).toHaveLength(3);
    expect(r.pool.find(p => p.kind === 'pair')).toBeTruthy();
  });

  it('extends single-origin to multi-project on second import', async () => {
    const r1 = await readPrimerPool(writePrimerPool([PRIMER_T7_FWD], PROJECT_A), []);
    const r2 = await readPrimerPool(
      writePrimerPool([PRIMER_T7_FWD_DIFFERENT_ID], PROJECT_B),
      r1.pool,
    );
    expect(r2.pool[0].origin.kind).toBe('multi-project');
    const r3 = await readPrimerPool(
      writePrimerPool([{ ...PRIMER_T7_FWD, id: 'pp01ALTID99' }], 'p01PROJ-C'),
      r2.pool,
    );
    // Third import should add a third source.
    expect(r3.pool[0].origin.sources.map(s => s.projectId).sort())
      .toEqual([PROJECT_A, PROJECT_B, 'p01PROJ-C'].sort());
  });
});

describe('K5 — indexPrimerPoolByHash', () => {
  it('builds Map<sha256, primer> skipping pairs and seqless entries', async () => {
    const idx = await indexPrimerPoolByHash([PRIMER_T7_FWD, PRIMER_T7_REV, PAIR_T7,
      { id: 'pp-empty', sequence: '' }]);
    expect(idx.size).toBe(2);
    // Same sequence hashes equal.
    const sameSeq = await indexPrimerPoolByHash([PRIMER_T7_FWD_DIFFERENT_ID]);
    const [keyA] = sameSeq.keys();
    expect(idx.has(keyA)).toBe(true);
  });
});
