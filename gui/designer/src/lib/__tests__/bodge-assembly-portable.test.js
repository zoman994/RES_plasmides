/**
 * K11 — .bodgeassembly portable subset write + import.
 */
import { describe, it, expect } from 'vitest';
import {
  writeBodgeAssembly,
  importBodgeAssembly,
} from '../bodge-assembly-portable';
import { readBodge, writeBodgeV2 } from '../bodge-zip';

function PROJECT_STATE() {
  return {
    projectMeta: { id: 'p01-source', name: 'Source project' },
    containers: [
      { id: 'c01', name: 'pET-28b', sequence: 'ATGCATG', topology: 'linear', annotations: [] },
      { id: 'c02', name: 'pUC19', sequence: 'GGGGGGG', topology: 'circular', annotations: [] },
      { id: 'c10', name: 'product', sequence: 'CCCCCCC', topology: 'linear', annotations: [] },
    ],
    pieces: [
      { id: 'pc01', kind: 'sourced', sourceIds: ['c01'], ranges: [], zoneId: 'zn01' },
    ],
    operations: [
      { id: 'op01', kind: 'pcr', inputs: ['c01'], outputs: ['c10'],
        params: { primerPairId: 'pp01' }, zoneId: 'zn01',
        materializedClones: [{ cloneId: 'c10', label: 'clone-1', sangerVerified: 'pending' }] },
    ],
    zones: [
      { id: 'zn01', name: 'pks4-ko', bounds: { x: 0, y: 0, width: 100, height: 100 }, viewMode: 'graph' },
      { id: 'zn02', name: 'unused', bounds: { x: 100, y: 100, width: 100, height: 100 }, viewMode: 'graph' },
    ],
    junctions: [],
    primers: [
      { id: 'pp01', sequence: 'ATGCATG', name: 'T7-fwd',
        origin: { kind: 'library-selection', projectId: 'p01-source' },
        boundContainers: [{ containerId: 'c01', bindStart: 0, bindEnd: 7 }] },
      { id: 'pp99', sequence: 'TTTAAAA', name: 'unused-primer',
        origin: { kind: 'library-selection', projectId: 'p01-source' } },
    ],
    libraryEntries: [
      { id: 'le01', kind: 'container', name: 'pET-28b', resourceHash: 'sha256-x', projectId: 'p01-source' },
    ],
    notebookEntries: [],
    attachmentsManifest: {},
  };
}

describe('K11 — writeBodgeAssembly', () => {
  it('produces a v2 blob restricted to the chosen zone', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const r = await readBodge(blob);
    expect(r.manifest.exportType).toBe('assembly');
    expect(r.state.zones).toHaveLength(1);
    expect(r.state.zones[0].id).toBe('zn01');
    expect(r.state.pieces.map(p => p.id)).toEqual(['pc01']);
  });

  it('keeps only containers referenced by the chosen zone', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const r = await readBodge(blob);
    // zn01 references c01 (piece.sourceIds), c10 (op outputs + materialized).
    const ids = r.state.containers.map(c => c.id).sort();
    expect(ids).toEqual(['c01', 'c10']);
  });

  it('keeps only primers referenced by ops in the chosen zone', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const r = await readBodge(blob);
    expect(r.state.primers).toHaveLength(1);
    expect(r.state.primers[0].id).toBe('pp01');
  });

  it('throws on missing zoneId', async () => {
    await expect(writeBodgeAssembly(PROJECT_STATE(), '')).rejects.toThrow(/zoneId/);
  });
});

describe('K11 — importBodgeAssembly merge', () => {
  it('dedups containers by sha256(sequence) — same seq under different id', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const existingState = {
      projectMeta: { id: 'p02-target', name: 'Target' },
      containers: [
        // Same sequence as 'c01' but different id.
        { id: 'c-target-1', name: 'my pET-28b', sequence: 'ATGCATG', topology: 'linear', annotations: [] },
      ],
      pieces: [], operations: [], zones: [], junctions: [], primers: [], libraryEntries: [],
    };
    const { state, report } = await importBodgeAssembly(blob, existingState);
    // c01 should dedupe with c-target-1; c10 (product) is new → added.
    expect(report.containersDedup).toBe(1);
    expect(report.containersAdded).toBe(1);
    expect(state.containers.map(c => c.id).sort()).toEqual(['c-target-1', 'c10']);
    // Refs in imported pieces should remap c01 → c-target-1.
    const importedPiece = state.pieces.find(p => p.id === 'pc01');
    expect(importedPiece.sourceIds).toEqual(['c-target-1']);
  });

  it('dedups primers by normalized sequence', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const existingState = {
      projectMeta: { id: 'p02-target' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [
        { id: 'pp-target', sequence: 'ATGCATG', name: 'target T7',
          origin: { kind: 'library-selection', projectId: 'p02-target' } },
      ],
      libraryEntries: [],
    };
    const { report } = await importBodgeAssembly(blob, existingState);
    expect(report.primersDedup).toBe(1);
    expect(report.primersAdded).toBe(0);
  });

  it('appends zones (unique by id) + pieces + operations from import', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    const existingState = {
      projectMeta: { id: 'p02-target' },
      containers: [], pieces: [], operations: [],
      zones: [{ id: 'zn99', name: 'existing', bounds: { x: 0, y: 0, width: 100, height: 100 }, viewMode: 'graph' }],
      junctions: [], primers: [], libraryEntries: [],
    };
    const { state, report } = await importBodgeAssembly(blob, existingState);
    expect(report.zonesAdded).toBe(1);
    expect(state.zones.map(z => z.id).sort()).toEqual(['zn01', 'zn99']);
    expect(state.pieces.map(p => p.id)).toEqual(['pc01']);
    expect(state.operations.map(o => o.id)).toEqual(['op01']);
  });

  it('does not re-add a zone with same id (idempotent re-import)', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    let state = {
      projectMeta: { id: 'p02-target' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [], libraryEntries: [],
    };
    const r1 = await importBodgeAssembly(blob, state);
    state = r1.state;
    const r2 = await importBodgeAssembly(blob, state);
    expect(r2.report.zonesAdded).toBe(0); // already there
  });

  it('rejects v1 input with clear error', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const v1Zip = zipSync({
      'manifest.json': strToU8(JSON.stringify({ fileFormatVersion: 1, schemaVersion: 1, appVersion: 'x',
        createdAt: 'x', updatedAt: 'x' })),
      'project.json': strToU8(JSON.stringify({ id: 'p01', name: 'legacy',
        containerIds: [], projectCommitIds: [], primerIds: [], settings: {}, ext: {} })),
    });
    const blob = new Blob([v1Zip]);
    await expect(importBodgeAssembly(blob, { containers: [], pieces: [], operations: [], zones: [],
      junctions: [], primers: [], libraryEntries: [] })).rejects.toThrow(/v1/);
  });

  it('preserves library entries (no dedup on identical key skip duplicate)', async () => {
    const sourceState = PROJECT_STATE();
    // Make the library entry's resource hash explicit + non-conflicting.
    sourceState.libraryEntries[0].resourceHash = 'sha256-unique-from-source';
    const blob = await writeBodgeAssembly(sourceState, 'zn01');
    const existingState = {
      projectMeta: { id: 'p02-target' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [], libraryEntries: [],
    };
    const { state, report } = await importBodgeAssembly(blob, existingState);
    expect(report.libraryAdded).toBe(1);
    expect(state.libraryEntries).toHaveLength(1);
  });
});

describe('K11 — round-trip into existing project + verify integrity', () => {
  it('export → import on different project → readBodge of original still works', async () => {
    const blob = await writeBodgeAssembly(PROJECT_STATE(), 'zn01');
    // Re-read the exported blob to confirm it's still a valid v2 .bodge.
    const r = await readBodge(blob);
    expect(r.formatVersion).toBe('2.0.0');
    expect(r.state.zones).toHaveLength(1);

    // Also confirm re-export via writeBodgeV2 round-trips the merged state.
    const merged = await importBodgeAssembly(blob, {
      projectMeta: { id: 'p-empty' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [], libraryEntries: [],
    });
    const reblob = await writeBodgeV2(merged.state);
    const rr = await readBodge(reblob);
    expect(rr.state.zones.map(z => z.id)).toContain('zn01');
  });
});
