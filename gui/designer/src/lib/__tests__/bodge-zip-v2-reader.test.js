/**
 * K7 — ZIP v2 reader (readBodge dispatcher + readBodgeV2).
 *
 * Verifies:
 *   - Signature detection dispatches v1 vs v2.
 *   - All v2 sections round-trip via write→read.
 *   - Orphan refs surface as warnings (not throws).
 *   - readBodge keeps the v1-shaped result for legacy callers.
 *   - state shape returned to canonical callers.
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  writeBodge,
  writeBodgeV2,
  readBodge,
  BODGE_V2_FILE_FORMAT_VERSION,
} from '../bodge-zip';
import { buildManifest as buildV2Manifest } from '../bodge-manifest-v2';

function CANONICAL_STATE() {
  return {
    projectMeta: {
      id: 'p01XYZ', name: 'Test Project',
      createdAt: '2026-04-01T10:00:00.000Z',
      focusedZoneId: 'zn01ABC',
      tags: ['demo'],
    },
    containers: [
      {
        id: 'c01XYZ', name: 'pET-28b',
        sequence: 'ATGCATATGAAGCTTTAATACGACTCACTATAGGGGAATT',
        topology: 'circular',
        annotations: [
          { id: 'a01', name: 'T7 promoter', type: 'promoter', start: 16, end: 38, strand: 1, color: '#E8A85F' },
        ],
        provenance: { commits: [{ id: 'cmt01', kind: 'import_baseline' }] },
      },
    ],
    pieces: [
      { id: 'pc01', name: 'frag-1', kind: 'sourced',
        sourceIds: ['c01XYZ'], ranges: [{ start: 0, end: 40, strand: 1, sourceId: 'c01XYZ' }],
        zoneId: 'zn01ABC' },
    ],
    operations: [
      { id: 'op01', kind: 'pcr', status: 'pending',
        inputs: ['c01XYZ'], inputPieces: ['pc01'], outputs: [],
        zoneId: 'zn01ABC' },
    ],
    zones: [
      { id: 'zn01ABC', name: 'pks4-ko',
        bounds: { x: 100, y: 100, width: 800, height: 600 },
        viewMode: 'graph', laneLayout: 'auto' },
    ],
    junctions: [],
    primers: [
      { id: 'pp01', name: 'T7-fwd', sequence: 'ATACGACTCACTATAGG',
        origin: { kind: 'library-selection', projectId: 'p01XYZ' } },
    ],
    libraryEntries: [
      { id: 'le01', kind: 'container', name: 'pUC19', payload: { sequence: 'aaaa' } },
    ],
  };
}

describe('K7 — readBodge dispatcher (signature detection)', () => {
  it('dispatches v2 manifest → readBodgeV2', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const r = await readBodge(blob);
    expect(r.formatVersion).toBe(BODGE_V2_FILE_FORMAT_VERSION);
    expect(r.state).toBeTruthy();
    expect(r.manifest.signature).toBe('BODGE-V2');
  });

  it('dispatches v1 manifest → readBodgeV1 (back-compat)', async () => {
    const projectSlice = {
      id: 'p01', schemaVer: 1, name: 'Legacy', tags: [],
      createdAt: 'x', updatedAt: 'x',
      containerIds: [], projectCommitIds: [], primerIds: [],
      settings: {}, ext: {},
    };
    const blob = writeBodge(projectSlice);
    const r = await readBodge(blob);
    expect(r.formatVersion).toBe('1.0.0');
    expect(r.project).toBeTruthy();
    expect(r.project.id).toBe('p01');
    expect(r.state).toBeUndefined(); // v1 path doesn't emit canonical state.
  });
});

describe('K7 — round-trip preserves the canonical state', () => {
  it('containers / pieces / operations / zones round-trip identity', async () => {
    const original = CANONICAL_STATE();
    const blob = await writeBodgeV2(original);
    const { state } = await readBodge(blob);
    expect(state.containers).toHaveLength(1);
    expect(state.containers[0].id).toBe('c01XYZ');
    expect(state.containers[0].sequence.toUpperCase()).toBe(original.containers[0].sequence);
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0].sourceIds).toEqual(['c01XYZ']);
    expect(state.operations).toHaveLength(1);
    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].id).toBe('zn01ABC');
  });

  it('primers round-trip with sequence + origin', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const { state } = await readBodge(blob);
    expect(state.primers).toHaveLength(1);
    expect(state.primers[0].sequence).toBe('ATACGACTCACTATAGG');
    expect(state.primers[0].origin.kind).toBe('library-selection');
  });

  it('libraryEntries round-trip', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const { libraryEntries, state } = await readBodge(blob);
    expect(libraryEntries).toHaveLength(1);
    expect(libraryEntries[0].name).toBe('pUC19');
    expect(state.libraryEntries).toEqual(libraryEntries);
  });

  it('container provenance COMMENT decodes back into container.provenance', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const { state } = await readBodge(blob);
    expect(state.containers[0].provenance).toBeTruthy();
    expect(state.containers[0].provenance.commits[0].id).toBe('cmt01');
  });

  it('zone metadata (bounds/viewMode/laneLayout) round-trips', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const { state } = await readBodge(blob);
    expect(state.zones[0].bounds).toEqual({ x: 100, y: 100, width: 800, height: 600 });
    expect(state.zones[0].viewMode).toBe('graph');
  });

  it('extensions preserved bit-perfect', async () => {
    const s = CANONICAL_STATE();
    s.extensions = {
      'mock-vendor': { 'data.json': '{"answer":42}' },
    };
    const blob = await writeBodgeV2(s);
    const { state } = await readBodge(blob);
    expect(state.extensions['mock-vendor']).toBeTruthy();
    expect(strFromU8(state.extensions['mock-vendor']['data.json']))
      .toBe('{"answer":42}');
  });
});

describe('K7 — soft warnings on orphan refs', () => {
  it('surfaces orphan piece.sourceIds as warning, does not throw', async () => {
    const s = CANONICAL_STATE();
    s.pieces[0].sourceIds = ['c-nonexistent'];
    const blob = await writeBodgeV2(s);
    const { warnings } = await readBodge(blob);
    expect(warnings.some(w => /orphan sourceId/.test(w))).toBe(true);
  });

  it('surfaces orphan op.inputs as warning', async () => {
    const s = CANONICAL_STATE();
    s.operations[0].inputs = ['c-missing'];
    const blob = await writeBodgeV2(s);
    const { warnings } = await readBodge(blob);
    expect(warnings.some(w => /orphan/.test(w))).toBe(true);
  });
});

describe('K7 — error handling', () => {
  it('throws on corrupt ZIP', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4])]);
    await expect(readBodge(blob)).rejects.toThrow(/повреждён|unzip/i);
  });

  it('throws on missing manifest.json', async () => {
    const zipped = zipSync({ 'project.json': strToU8('{}') });
    await expect(readBodge(new Blob([zipped]))).rejects.toThrow(/manifest\.json/);
  });

  it('throws on invalid v2 manifest', async () => {
    const manifest = buildV2Manifest({ appVersion: '0.9.0' });
    manifest.signature = 'BODGE-V2'; // valid signature → dispatcher → v2 reader
    manifest.fileFormatVersion = 'NOT-SEMVER'; // but invalid format → validator throws
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
    });
    await expect(readBodge(new Blob([zipped]))).rejects.toThrow(/manifest validation/);
  });

  it('warns on corrupt container .gb instead of throwing whole read', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    // Patch the blob to have a broken .gb inside.
    const buf = await blob.arrayBuffer();
    const { unzipSync, zipSync: zip } = await import('fflate');
    const entries = unzipSync(new Uint8Array(buf));
    entries['containers/c01XYZ.gb'] = strToU8('garbage non-genbank content');
    const broken = new Blob([zip(entries)]);
    const r = await readBodge(broken);
    // Reader is tolerant — light parser still produces an empty container,
    // no throw. We assert the call succeeds and returns a state.
    expect(r.state).toBeTruthy();
  });
});

// strFromU8 only used in extensions assert above — import here:
import { strFromU8 } from 'fflate';

// ---------------------------------------------------------------------------
// ANN-0L - the container is the round-trip, not just the pool serializer.
//
// The user's primers live in the .bodge file. If the container loses a site, a
// duplicate record or a record with no known oligo, the loss is permanent and
// invisible: the file reopens looking complete.
// ---------------------------------------------------------------------------
describe('ANN-0L - primer records survive a full .bodge round-trip', () => {
  const RECORDS = [
    {
      id: 'pr-1',
      schemaVersion: 2,
      name: 'M13-fwd',
      sequence: null,                 // the file never stated the full oligo
      sequenceSource: 'unknown',
      origin: { kind: 'file_import', entryId: 'c01XYZ', sourceFileName: 'a.dna', sourceRecordIndex: 0 },
      sites: [
        {
          id: 'st-1', sourceIndex: 0,
          target: { entryId: 'c01XYZ' },
          location: { kind: 'join', segments: [{ start: 36, end: 40 }, { start: 0, end: 6 }] },
          strand: 1,
          annealedSequence: 'GAATTATGCAT',
          tail: null,
          meltingTemperature: null,
          sourceVisibility: 'shown',
          sourceForms: ['full', 'simplified'],
        },
        {
          id: 'st-2', sourceIndex: 1,
          target: { entryId: 'c01XYZ' },
          location: { kind: 'single', segments: [{ start: 10, end: 20 }] },
          strand: -1,
          annealedSequence: 'AAGCTTATAT',
          tail: '',                   // proven absent, NOT unknown
          meltingTemperature: 58.2,
          sourceVisibility: 'hidden',
          sourceForms: ['full'],
        },
      ],
    },
    {
      // same name AND same sequence as the next one: two things the user made
      id: 'pr-2',
      schemaVersion: 2,
      name: 'T7-fwd',
      sequence: 'ATACGACTCACTATAGG',
      sequenceSource: 'source',
      origin: { kind: 'file_import', entryId: 'c01XYZ', sourceFileName: 'a.dna', sourceRecordIndex: 1 },
      sites: [],
    },
    {
      id: 'pr-3',
      schemaVersion: 2,
      name: 'T7-fwd',
      sequence: 'ATACGACTCACTATAGG',
      sequenceSource: 'source',
      origin: { kind: 'file_import', entryId: 'c01XYZ', sourceFileName: 'a.dna', sourceRecordIndex: 2 },
      sites: [],
    },
  ];

  async function roundTrip(primers) {
    const blob = await writeBodgeV2({ ...CANONICAL_STATE(), primers });
    const out = await readBodge(blob);
    return out.state ? out.state.primers : out.primers;
  }

  it('returns every record, in order, deep-equal', async () => {
    const back = await roundTrip(RECORDS);
    expect(back.map((p) => p.id)).toEqual(['pr-1', 'pr-2', 'pr-3']);
    for (let i = 0; i < RECORDS.length; i++) {
      for (const k of Object.keys(RECORDS[i])) {
        expect(back[i][k]).toEqual(RECORDS[i][k]);
      }
    }
  });

  it('does not collapse two records that share a name and a sequence', async () => {
    const back = await roundTrip(RECORDS);
    expect(back.filter((p) => p.name === 'T7-fwd')).toHaveLength(2);
  });

  it('keeps a record whose full oligo is unknown', async () => {
    const back = await roundTrip(RECORDS);
    const m13 = back.find((p) => p.id === 'pr-1');
    expect(m13).toBeTruthy();
    expect(m13.sequence).toBe(null);
  });

  it('keeps every site, its segments, its strand and its visibility', async () => {
    const back = await roundTrip(RECORDS);
    const m13 = back.find((p) => p.id === 'pr-1');
    expect(m13.sites).toHaveLength(2);
    // the origin-crossing site keeps BOTH segments and their order
    expect(m13.sites[0].location.segments).toEqual([{ start: 36, end: 40 }, { start: 0, end: 6 }]);
    expect(m13.sites[1].strand).toBe(-1);
    expect(m13.sites[1].sourceVisibility).toBe('hidden');
  });

  it('preserves the difference between an unknown tail and a proven-absent one', async () => {
    const back = await roundTrip(RECORDS);
    const m13 = back.find((p) => p.id === 'pr-1');
    expect(m13.sites[0].tail).toBe(null);   // unknown
    expect(m13.sites[1].tail).toBe('');     // proven absent
  });

  it('is stable across a second save/open cycle', async () => {
    const once = await roundTrip(RECORDS);
    const twice = await roundTrip(once);
    expect(twice).toEqual(once);
  });
});
