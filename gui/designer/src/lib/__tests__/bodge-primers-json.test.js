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
      bindingModel: 'aligned-v1',
      tail: 'GGATCC',
      direction: 'forward',
      status: 'ordered',
      tm: 55,
      tags: ['колония'],
      origin: { kind: 'library-selection', projectId: 'p01PROJ-A' },
      sites: [{
        id: 's0',
        location: { kind: 'single', segments: [{ start: 10, end: 22 }] },
        strand: 1,
        annealedSequence: 'ACGTACGTACGT',
      }],
    };
    const json = writePrimerPool([tailed], 'p01PROJ-A');
    const { pool } = await readPrimerPool(json, []);
    const got = pool.find((p) => p.id === 'pp01TAILED1');
    expect(got.bindingSequence).toBe('ACGTACGTACGT');
    expect(got.bindingModel).toBe('aligned-v1');
    expect(got.sites).toEqual(tailed.sites);
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

// ANN-0L supersedes the §8.1 sequence-dedup rule for the FULL PROJECT
// container: two records that merely share an oligo are two entries the user
// created. The rule survives only as an explicit option on the portable
// `.bodgeassembly` merge path. These three cases are rewritten accordingly.
describe('K5 — readPrimerPool identity (ANN-0L: by record id)', () => {
  it('first import: adds all primers fresh', async () => {
    const s = writePrimerPool([PRIMER_T7_FWD, PRIMER_T7_REV], PROJECT_A);
    const r = await readPrimerPool(s, []);
    expect(r.pool).toHaveLength(2);
    expect(r.mergedCount).toBe(2);
    expect(r.dedupCount).toBe(0);
  });

  it('ANN-0L: identical sequence, different ids → TWO pool entries', async () => {
    const fileA = writePrimerPool([PRIMER_T7_FWD], PROJECT_A);
    const fileB = writePrimerPool([PRIMER_T7_FWD_DIFFERENT_ID], PROJECT_B);
    const r1 = await readPrimerPool(fileA, []);
    const r2 = await readPrimerPool(fileB, r1.pool);
    // Two distinct records that happen to share an oligo are TWO entries.
    expect(r2.pool).toHaveLength(2);
    expect(r2.dedupCount).toBe(0);
    expect(r2.mergedCount).toBe(1);
    expect(r2.pool.map((p) => p.id).sort())
      .toEqual([PRIMER_T7_FWD.id, PRIMER_T7_FWD_DIFFERENT_ID.id].sort());
  });

  it('case-insensitive sequence comparison (uppercase vs lowercase)', async () => {
    const fileA = writePrimerPool([{ ...PRIMER_T7_FWD, sequence: 'atacgactcactataggggaattgtgagcggataac' }], PROJECT_A);
    const fileB = writePrimerPool([PRIMER_T7_FWD], PROJECT_B);
    const r1 = await readPrimerPool(fileA, []);
    const r2 = await readPrimerPool(fileB, r1.pool);
    expect(r2.pool).toHaveLength(1);
    expect(r2.dedupCount).toBe(1);
  });

  it('ANN-0L: a no-sequence primer is KEPT with a warning, not skipped', async () => {
    const noSeq = { id: 'pp99', name: 'broken', sequence: null };
    const s = writePrimerPool([noSeq], PROJECT_A);
    const r = await readPrimerPool(s, []);
    // The record survives as incomplete; the user can see and delete it.
    expect(r.pool).toHaveLength(1);
    expect(r.pool[0].id).toBe('pp99');
    expect(r.warnings.some(w => /pp99/.test(w))).toBe(true);
  });

  it('pairs pass through without dedup', async () => {
    const file = writePrimerPool([PRIMER_T7_FWD, PRIMER_T7_REV, PAIR_T7], PROJECT_A);
    const r = await readPrimerPool(file, []);
    expect(r.pool).toHaveLength(3);
    expect(r.pool.find(p => p.kind === 'pair')).toBeTruthy();
  });

  it('ANN-0L: re-importing the SAME record id does not duplicate it', async () => {
    const r1 = await readPrimerPool(writePrimerPool([PRIMER_T7_FWD], PROJECT_A), []);
    // Same container again: the same record id must not become a second row.
    const again = await readPrimerPool(writePrimerPool([PRIMER_T7_FWD], PROJECT_A), r1.pool);
    expect(again.pool).toHaveLength(1);
    expect(again.dedupCount).toBe(1);

    // A DIFFERENT record id is a different record, even with the same oligo.
    const r2 = await readPrimerPool(
      writePrimerPool([PRIMER_T7_FWD_DIFFERENT_ID], PROJECT_B),
      again.pool,
    );
    expect(r2.pool).toHaveLength(2);
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


// ── ANN-0L/3 — the full project container is LOSSLESS ──────────────────────
//
// OLD assumption, stated in this file's header and encoded below it: the v2
// reader merges by normalized-sequence hash, so "two .bodge files with
// identical primer sequence under different ids land as ONE pool entry".
//
// That is now a defect for the FULL PROJECT container. Two separately named
// source primers are two records the user created; collapsing them destroys
// one. A record with no known sequence was skipped outright. Both are fixed
// here. The sequence-dedup policy survives only as an explicit option on the
// portable `.bodgeassembly` merge path, which is a different contract.

describe('ANN-0L/3 — .bodge keeps every primer record', () => {
  const SEQ = 'ACGTACGTACGTACGTAC';

  function rec(over = {}) {
    return {
      id: over.id || 'p1',
      schemaVersion: 2,
      name: over.name ?? 'P',
      sequence: 'sequence' in over ? over.sequence : SEQ,
      sequenceSource: over.sequenceSource || 'source',
      origin: over.origin || { kind: 'file_import', sourceRecordIndex: 0 },
      sites: over.sites || [],
      ...over,
    };
  }

  it('two records with the SAME sequence and different ids both survive', async () => {
    const json = writePrimerPool([
      rec({ id: 'a', name: 'orderA' }),
      rec({ id: 'b', name: 'orderB' }),
    ], 'proj-1');
    const { pool } = await readPrimerPool(json, []);

    expect(pool).toHaveLength(2);
    expect(pool.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('a record with NO sequence is written and read back, not skipped', async () => {
    const json = writePrimerPool([rec({ id: 'noseq', sequence: null })], 'proj-1');
    const { pool } = await readPrimerPool(json, []);

    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('noseq');
    // unknown must survive as unknown — not coerced to an empty string
    expect(pool[0].sequence).toBeNull();
  });

  it('sites survive with order, strand and null/empty distinctions', async () => {
    const sites = [
      {
        id: 's1', sourceIndex: 0, strand: 1,
        location: { kind: 'single', segments: [{ start: 100, end: 118 }] },
        annealedSequence: SEQ, tail: 'GGATCC',
        sourceVisibility: 'shown', sourceForms: ['standard'],
      },
      {
        id: 's2', sourceIndex: 1, strand: -1,
        location: { kind: 'single', segments: [{ start: 200, end: 218 }] },
        annealedSequence: null, tail: null,
        sourceVisibility: 'hidden', sourceForms: ['standard'],
      },
    ];
    const json = writePrimerPool([rec({ id: 'multi', sites })], 'proj-1');
    const { pool } = await readPrimerPool(json, []);

    expect(pool[0].sites).toHaveLength(2);
    expect(pool[0].sites[0].tail).toBe('GGATCC');  // a proven tail round-trips
    expect(pool[0].sites[1].tail).toBeNull();      // unknown stays null, not ''
    expect(pool[0].sites[1].annealedSequence).toBeNull();
    expect(pool[0].sites[1].sourceVisibility).toBe('hidden');
    expect(pool[0].sites.map((s) => s.sourceIndex)).toEqual([0, 1]);
  });

  it('a fresh write → read → write → read is deep-equal', async () => {
    const original = [
      rec({ id: 'a', name: 'orderA' }),
      rec({ id: 'b', name: 'orderB', sequence: null }),
    ];
    const once = await readPrimerPool(writePrimerPool(original, 'proj-1'), []);
    const twice = await readPrimerPool(writePrimerPool(once.pool, 'proj-1'), []);

    expect(twice.pool).toEqual(once.pool);
  });

  it('legacy flat records still read', async () => {
    const legacy = JSON.stringify({
      fileFormatVersion: 2,
      projectId: null,
      primers: [{ id: 'old', name: 'legacy', sequence: SEQ, direction: 'forward' }],
    });
    const { pool } = await readPrimerPool(legacy, []);

    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe('old');
    expect(pool[0].sequence).toBe(SEQ);
  });
});

// ---------------------------------------------------------------------------
// ANN-0L - sequence-level merging is a PORTABLE-path policy, not a default.
// ---------------------------------------------------------------------------
describe('ANN-0L - dedupBySequence is opt-in', () => {
  const pool = JSON.stringify({
    projectId: 'proj-1',
    primers: [
      { id: 'b', name: 'copy', sequence: 'ACGTACGTACGT' },
      { id: 'c', name: 'no-oligo', sequence: null },
    ],
  });
  const existing = [{ id: 'a', name: 'orig', sequence: 'ACGTACGTACGT' }];

  it('keeps a same-sequence record by default (full project container)', async () => {
    const r = await readPrimerPool(pool, existing);
    expect(r.pool.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.dedupCount).toBe(0);
  });

  it('folds it away only when the caller explicitly asks (portable merge)', async () => {
    const r = await readPrimerPool(pool, existing, { dedupBySequence: true });
    expect(r.pool.map((p) => p.id)).toEqual(['a', 'c']);
    expect(r.dedupCount).toBe(1);
  });

  it('keeps a sequence-less record even under the portable policy', async () => {
    const r = await readPrimerPool(pool, existing, { dedupBySequence: true });
    // no sequence to compare on - dropping it would be a silent deletion
    expect(r.pool.some((p) => p.id === 'c')).toBe(true);
  });
});
