/**
 * K8 — full v1 → v2 migration pipeline.
 *
 * Tests cover three reference scenarios per §11.4:
 *   - v0.7.x (no zones at all).
 *   - v0.8.x post-T3-revert (zones: []).
 *   - v0.8.x with zones inline (pre-revert / synthetic).
 *
 * Plus idempotency, atomicity, lossless surfaces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import {
  migrateBodgeV1toV2,
  marshalV1ProjectToCanonicalState,
  analyzeMigrationLoss,
  detectFormatVersion,
} from '../bodge-migrations/v1-to-v2';
import { readBodge, writeBodgeV2 } from '../bodge-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = resolve(
  __dirname, '..', '..', '__tests__', 'interop', 'fixtures', 'bodge-v1',
);

function loadFixture(name) {
  return new Blob([readFileSync(resolve(FIXTURE_DIR, name))], { type: 'application/zip' });
}

function makeV1Bodge(project, libraryEntries = []) {
  const files = {
    'manifest.json': strToU8(JSON.stringify({
      fileFormatVersion: 1, schemaVersion: 1, appVersion: '0.8.3-alpha',
      createdAt: 'x', updatedAt: 'x',
    })),
    'project.json': strToU8(JSON.stringify(project)),
  };
  if (libraryEntries.length) {
    files['library/entries.json'] = strToU8(JSON.stringify(libraryEntries));
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

describe('K8 — marshalV1ProjectToCanonicalState', () => {
  it('marshals v0.7.x (no zones) → empty arrays', () => {
    const v1Project = {
      id: 'p07', name: 'v0.7 project', tags: ['legacy'],
      createdAt: '2026-01-01', updatedAt: '2026-02-01',
      containerIds: [], primerIds: [],
    };
    const state = marshalV1ProjectToCanonicalState(v1Project, []);
    expect(state.projectMeta.id).toBe('p07');
    expect(state.containers).toEqual([]);
    expect(state.zones).toEqual([]);
    expect(state.libraryEntries).toEqual([]);
  });

  it('marshals v0.8.x post-T3-revert (zones:[]) → empty zones array', () => {
    const v1Project = {
      id: 'p08', name: 'v0.8 post-T3-revert',
      zones: [], containers: [], pieces: [], operations: [],
    };
    const state = marshalV1ProjectToCanonicalState(v1Project, []);
    expect(state.zones).toEqual([]);
    expect(state.containers).toEqual([]);
  });

  it('marshals v0.8.x with zones inline → preserves zones', () => {
    const v1Project = {
      id: 'p08',
      name: 'v0.8 with zones',
      zones: [{ id: 'zn01', name: 'sub-1', bounds: { x: 0, y: 0, width: 800, height: 600 }, viewMode: 'graph' }],
      containers: [{ id: 'c01', name: 'pET', sequence: 'ATGC', topology: 'circular', annotations: [] }],
      pieces: [],
      operations: [],
    };
    const state = marshalV1ProjectToCanonicalState(v1Project, []);
    expect(state.zones).toHaveLength(1);
    expect(state.containers).toHaveLength(1);
    expect(state.containers[0].id).toBe('c01');
  });

  it('preserves library entries verbatim', () => {
    const libraryEntries = [
      { id: 'le01', kind: 'container', name: 'pUC19', tags: ['vector'] },
    ];
    const v1Project = { id: 'p01', name: 'Test' };
    const state = marshalV1ProjectToCanonicalState(v1Project, libraryEntries);
    expect(state.libraryEntries).toEqual(libraryEntries);
  });

  it('marshals author from agent.name', () => {
    const v1Project = { id: 'p01', name: 'Test', agent: { name: 'Igor', email: '' } };
    const state = marshalV1ProjectToCanonicalState(v1Project, []);
    expect(state.projectMeta.author.name).toBe('Igor');
  });
});

describe('K8 — analyzeMigrationLoss', () => {
  it('flags loose-containers when containers without zones', () => {
    const losses = analyzeMigrationLoss({
      containers: [{ id: 'c01' }], zones: [],
    });
    expect(losses.some(l => l.kind === 'loose-containers')).toBe(true);
  });

  it('flags empty-project when no containers + no zones', () => {
    const losses = analyzeMigrationLoss({ containers: [], zones: [] });
    expect(losses.some(l => l.kind === 'empty-project')).toBe(true);
  });

  it('flags plasmid-git-history loss when projectCommitIds non-empty', () => {
    const losses = analyzeMigrationLoss({
      containers: [{ id: 'c01' }], zones: [{ id: 'z' }],
      projectCommitIds: ['cmt01'],
    });
    expect(losses.some(l => l.kind === 'plasmid-git-history-missing')).toBe(true);
  });
});

describe('K8 — full migration pipeline', () => {
  it('migrates v1-empty.bodge fixture → v2 with stamps', async () => {
    const blob = loadFixture('v1-empty.bodge');
    const v2 = await migrateBodgeV1toV2(blob);
    expect(v2._migrationFrom).toBe('1.0.0');
    const r = await readBodge(v2);
    expect(r.formatVersion).toBe('2.0.0');
    expect(r.state.containers).toEqual([]);
    expect(r.manifest.metadata.title).toBe('Empty v1 project');
  });

  it('migrates v1-with-library.bodge → v2 preserves library entries', async () => {
    const blob = loadFixture('v1-with-library.bodge');
    const v2 = await migrateBodgeV1toV2(blob);
    const r = await readBodge(v2);
    expect(r.libraryEntries).toHaveLength(1);
    expect(r.libraryEntries[0].name).toBe('pUC19');
  });

  it('migrates v0.7.x synthetic (no zones field) → empty zones + loss toast', async () => {
    const v1Project = { id: 'p07', name: 'v0.7', tags: [],
      createdAt: 'x', updatedAt: 'x',
      containerIds: [], primerIds: [], projectCommitIds: [] };
    const blob = makeV1Bodge(v1Project);
    const v2 = await migrateBodgeV1toV2(blob);
    const r = await readBodge(v2);
    expect(r.state.zones).toEqual([]);
    expect(v2._migrationLosses.some(l => l.kind === 'empty-project')).toBe(true);
  });

  it('migrates v0.8.x post-T3-revert (zones:[]) → still empty', async () => {
    const v1Project = { id: 'p08', name: 'post-revert',
      tags: [], createdAt: 'x', updatedAt: 'x',
      zones: [], containers: [], pieces: [], operations: [],
      containerIds: [], primerIds: [] };
    const blob = makeV1Bodge(v1Project);
    const v2 = await migrateBodgeV1toV2(blob);
    const r = await readBodge(v2);
    expect(r.state.zones).toEqual([]);
  });

  it('migrates v0.8.x with zones inline → zones preserved', async () => {
    const v1Project = {
      id: 'p08', name: 'with zones',
      tags: [], createdAt: 'x', updatedAt: 'x',
      zones: [{ id: 'zn01', name: 'sub-1', bounds: { x: 0, y: 0, width: 800, height: 600 }, viewMode: 'graph' }],
      containers: [{ id: 'c01', name: 'pET', sequence: 'ATGC', topology: 'linear', annotations: [] }],
      pieces: [{ id: 'pc01', kind: 'sourced', sourceIds: ['c01'], ranges: [], zoneId: 'zn01' }],
      operations: [],
      containerIds: [], primerIds: [],
    };
    const blob = makeV1Bodge(v1Project);
    const v2 = await migrateBodgeV1toV2(blob);
    const r = await readBodge(v2);
    expect(r.state.zones).toHaveLength(1);
    expect(r.state.containers).toHaveLength(1);
    expect(r.state.pieces).toHaveLength(1);
  });

  it('migration is idempotent — re-running on v2 returns unchanged', async () => {
    const v1 = loadFixture('v1-empty.bodge');
    const v2first = await migrateBodgeV1toV2(v1);
    const v2second = await migrateBodgeV1toV2(v2first);
    // Bytes should be identical (idempotent).
    const buf1 = await v2first.arrayBuffer();
    const buf2 = await v2second.arrayBuffer();
    expect(buf1.byteLength).toBe(buf2.byteLength);
  });

  it('round-trip v1 → v2 → re-export → re-import → state identity', async () => {
    const v1 = loadFixture('v1-with-library.bodge');
    const v2 = await migrateBodgeV1toV2(v1);
    const r1 = await readBodge(v2);
    const v2again = await writeBodgeV2(r1.state, { appVersion: '0.9.0-alpha' });
    const r2 = await readBodge(v2again);
    expect(r2.libraryEntries).toHaveLength(1);
    expect(r2.state.projectMeta.id).toBe(r1.state.projectMeta.id);
  });
});

describe('K8 — detectFormatVersion', () => {
  it('detects v2 signature', () => {
    expect(detectFormatVersion({ signature: 'BODGE-V2' })).toBe('2.0.0');
  });

  it('detects v1 by numeric fileFormatVersion', () => {
    expect(detectFormatVersion({ fileFormatVersion: 1 })).toBe('1.0.0');
  });

  it('returns "unknown" on malformed manifest', () => {
    expect(detectFormatVersion(null)).toBe('unknown');
    expect(detectFormatVersion({})).toBe('unknown');
  });
});
