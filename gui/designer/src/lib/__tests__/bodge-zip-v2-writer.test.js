/**
 * K6 — ZIP v2 writer (writeBodgeV2 + writeBodge dispatcher).
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  writeBodge,
  writeBodgeV2,
  BODGE_V2_FILE_FORMAT_VERSION,
} from '../bodge-zip';
import { isBodgeV2Manifest } from '../bodge-manifest-v2';

function CANONICAL_STATE() {
  return {
    projectMeta: {
      id: 'p01XYZABCDEF',
      name: 'pks4 knockout study',
      description: 'Gibson assembly',
      tags: ['aspergillus', 'crispr'],
      author: { name: 'Igor', deviceId: '01XYZ-device' },
      createdAt: '2026-04-01T10:00:00.000Z',
      focusedZoneId: 'zn01ABC',
      labels: { color: 'amber' },
      ui: { lastOpenedTab: 'library' },
    },
    containers: [
      {
        id: 'c01XYZ',
        name: 'pET-28b',
        sequence: 'ATGCATATGAAGCTTTAATACGACTCACTATAGGGGAATT',
        topology: 'circular',
        annotations: [
          { id: 'a01', name: 'T7 promoter', type: 'promoter', start: 16, end: 38, strand: 1, color: '#E8A85F' },
        ],
        provenance: { commits: [{ id: 'cmt01', kind: 'import_baseline' }] },
      },
    ],
    pieces: [
      {
        id: 'pc01', name: 'frag-1', kind: 'sourced',
        sourceIds: ['c01XYZ'], ranges: [{ start: 0, end: 40, strand: 1, sourceId: 'c01XYZ' }],
        zoneId: 'zn01ABC',
      },
    ],
    operations: [
      {
        id: 'op01', kind: 'pcr', status: 'pending',
        inputs: ['c01XYZ'], inputPieces: ['pc01'], outputs: [],
        zoneId: 'zn01ABC',
      },
    ],
    zones: [
      {
        id: 'zn01ABC', name: 'pks4-knockout',
        bounds: { x: 100, y: 100, width: 800, height: 600 },
        viewMode: 'graph', laneLayout: 'auto',
      },
    ],
    junctions: [],
    primers: [
      { id: 'pp01', name: 'T7-fwd', sequence: 'ATACGACTCACTATAGG', origin: { kind: 'library-selection', projectId: 'p01XYZABCDEF' } },
    ],
    libraryEntries: [
      { id: 'le01', kind: 'container', name: 'pUC19', payload: { sequence: 'a'.repeat(100) } },
    ],
    extensions: {
      'crispr-fork': {
        'scores.json': '{"target1":0.95}',
        'manifest.json': '{"vendor":"crispr-fork","version":"1.0.0"}',
      },
    },
  };
}

async function readZip(blob) {
  const buf = await blob.arrayBuffer();
  return unzipSync(new Uint8Array(buf));
}

describe('K6 — writeBodgeV2 produces a v2 ZIP', () => {
  it('returns a Blob with v2 manifest signature', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    expect(blob).toBeInstanceOf(Blob);
    const entries = await readZip(blob);
    expect(entries['manifest.json']).toBeTruthy();
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(isBodgeV2Manifest(manifest)).toBe(true);
    expect(manifest.fileFormatVersion).toBe(BODGE_V2_FILE_FORMAT_VERSION);
  });

  it('emits README.md as one of the assets', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['README.md']).toBeTruthy();
    const md = strFromU8(entries['README.md']);
    expect(md).toMatch(/^# pks4 knockout study/);
  });

  it('emits one containers/<id>.gb per container with valid GenBank', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['containers/c01XYZ.gb']).toBeTruthy();
    const gb = strFromU8(entries['containers/c01XYZ.gb']);
    expect(gb).toMatch(/^LOCUS/);
    expect(gb).toContain('/label="T7 promoter"');
    expect(gb).toMatch(/\/\/\s*$/);
  });

  it('emits one assemblies/<zoneId>.json per zone', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['assemblies/zn01ABC.json']).toBeTruthy();
    const parsed = JSON.parse(strFromU8(entries['assemblies/zn01ABC.json']));
    expect(parsed.id).toBe('zn01ABC');
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.operations).toHaveLength(1);
  });

  it('emits primers/pool.json when primers present', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['primers/pool.json']).toBeTruthy();
    const pool = JSON.parse(strFromU8(entries['primers/pool.json']));
    expect(pool.primers).toHaveLength(1);
    expect(pool.primers[0].sequence).toBe('ATACGACTCACTATAGG');
  });

  it('emits library/entries.json when library entries present', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['library/entries.json']).toBeTruthy();
    const lib = JSON.parse(strFromU8(entries['library/entries.json']));
    expect(lib).toHaveLength(1);
    expect(lib[0].name).toBe('pUC19');
  });

  it('preserves extensions/<vendor>/ tree bit-perfect', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['extensions/crispr-fork/scores.json']).toBeTruthy();
    expect(strFromU8(entries['extensions/crispr-fork/scores.json']))
      .toBe('{"target1":0.95}');
    expect(strFromU8(entries['extensions/crispr-fork/manifest.json']))
      .toContain('"vendor":"crispr-fork"');
  });

  it('emits _recovery.json with sha256 + size of every asset', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['_recovery.json']).toBeTruthy();
    const rec = JSON.parse(strFromU8(entries['_recovery.json']));
    expect(rec.version).toBe(BODGE_V2_FILE_FORMAT_VERSION);
    expect(Array.isArray(rec.files)).toBe(true);
    const manifestEntry = rec.files.find(f => f.path === 'manifest.json');
    expect(manifestEntry).toBeTruthy();
    expect(manifestEntry.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('emits lightweight project.json (no state-blob)', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    expect(entries['project.json']).toBeTruthy();
    const proj = JSON.parse(strFromU8(entries['project.json']));
    expect(proj.id).toBe('p01XYZABCDEF');
    expect(proj.name).toBe('pks4 knockout study');
    expect(proj.focusedZoneId).toBe('zn01ABC');
    // No containers/pieces/operations inside.
    expect(proj.containers).toBeUndefined();
    expect(proj.pieces).toBeUndefined();
  });

  it('manifest assets map references all written files', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const entries = await readZip(blob);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest.assets['containers/c01XYZ.gb']).toBeTruthy();
    expect(manifest.assets['assemblies/zn01ABC.json']).toBeTruthy();
    expect(manifest.assets['README.md']).toBeTruthy();
    expect(manifest.refs.containers).toContain('c01XYZ');
    expect(manifest.refs.assemblies).toContain('zn01ABC');
    expect(manifest.refs.primerPool).toBe('primers/pool.json');
    expect(manifest.refs.library).toBe('library/entries.json');
  });

  it('public-supp profile strips deviceId from manifest', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE(), { exportProfile: 'public-supp' });
    const entries = await readZip(blob);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest.exportProfile).toBe('public-supp');
    expect(manifest.metadata.author.deviceId).toBe('');
    expect(manifest.metadata.author.name).toBe('Igor'); // not stripped
  });

  it('single-assembly export restricts to chosen zoneId', async () => {
    const state = CANONICAL_STATE();
    state.zones.push({ id: 'zn02XYZ', name: 'rescue', bounds: { x: 0, y: 0, width: 100, height: 100 }, viewMode: 'graph' });
    state.pieces.push({ id: 'pc99', kind: 'sourced', sourceIds: ['c01XYZ'], ranges: [], zoneId: 'zn02XYZ' });
    const blob = await writeBodgeV2(state, {
      exportType: 'assembly', singleAssemblyZoneId: 'zn01ABC',
    });
    const entries = await readZip(blob);
    expect(entries['assemblies/zn01ABC.json']).toBeTruthy();
    expect(entries['assemblies/zn02XYZ.json']).toBeUndefined();
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest.exportType).toBe('assembly');
  });
});

describe('K6 — writeBodge dispatcher', () => {
  it('routes canonical state shape to v2 writer', async () => {
    const blob = await writeBodge(CANONICAL_STATE());
    const entries = await readZip(blob);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(isBodgeV2Manifest(manifest)).toBe(true);
  });

  it('routes legacy projectSlice shape to v1 writer (back-compat)', async () => {
    const projectSlice = {
      id: 'p01', schemaVer: 1, name: 'Legacy', tags: [],
      createdAt: 'x', updatedAt: 'x',
      containerIds: [], projectCommitIds: [], primerIds: [],
      settings: {}, ext: {},
    };
    const blob = writeBodge(projectSlice);
    const entries = await readZip(blob);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(isBodgeV2Manifest(manifest)).toBe(false);
    expect(manifest.fileFormatVersion).toBe(1);
  });
});
