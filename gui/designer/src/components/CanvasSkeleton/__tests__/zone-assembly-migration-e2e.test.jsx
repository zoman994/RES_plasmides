/**
 * zone-assembly-migration-e2e.test.jsx — T6 K15.
 *
 * End-to-end: a pre-T6 snapshot (assemblyDrafts + sourced segments) →
 * migrate v7→v8 → zones + pieces → load → open the assembly tab on the
 * migrated zone → the shell renders the migrated pieces → Realise
 * produces the same ops/junctions/containers as a legacy draft would.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import { buildInitialState } from '../store/skeleton-state';
import { migrateSnapshot } from '../store/skeleton-persistence';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const C1 = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false },
};
const C2 = {
  id: 'src2', kind: 'molecule', name: 'pET',
  sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false },
};

function seg(id, cid, seq) {
  return {
    id,
    source: { type: 'container', containerId: cid, sourceContainerName: cid },
    start: 0,
    end: 24,
    reverseComplement: false,
    sequence: seq,
    length: 24,
    annotations: [],
  };
}

function preT6Snapshot() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, C1, C2],
    assemblyDrafts: [{
      id: 'asm-old',
      name: 'OldBuild',
      topology: { circular: false },
      position: { x: 80, y: 80 },
      realiseRevision: 0,
      segments: [seg('s1', 'src1', C1.sequence), seg('s2', 'src2', C2.sequence)],
    }],
  };
}

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

// buildInitialState seeds a default zone (T3) — migration ADDS one.
const BASE = buildInitialState();
const baseZones = (BASE.zones || []).length;
const basePieces = (BASE.pieces || []).length;
// The migration-created zone is the one pushed last.
const migZone = (m) => m.zones[m.zones.length - 1];

describe('T6 K15 — pre-T6 snapshot → migrate → zone-mode shell → realise', () => {
  it('v7→v8 migration: draft → zone(viewMode:sequence) + pieces; drafts emptied', () => {
    const migrated = migrateSnapshot(preT6Snapshot(), 7);
    expect(migrated.assemblyDrafts).toEqual([]);
    expect(migrated.zones).toHaveLength(baseZones + 1);
    const z = migZone(migrated);
    expect(z.viewMode).toBe('sequence');
    expect(migrated.pieces).toHaveLength(basePieces + 2);
    const zonePcs = migrated.pieces.filter((p) => p.zoneId === z.id);
    expect(zonePcs).toHaveLength(2);
    expect(zonePcs.every((p) => p.origin === 'legacy-migration')).toBe(true);
  });

  it('loaded migrated state → assembly tab renders the 2 migrated pieces', () => {
    const migrated = migrateSnapshot(preT6Snapshot(), 7);
    const zid = migZone(migrated).id;
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: migrated }); });
    act(() => { A.openEditorAssemblyTab(zid); });
    const shell = screen.getByTestId('assembly-mode-shell');
    expect(shell.getAttribute('data-draft-id')).toBe(zid);
    expect(screen.getAllByTestId('assembly-segment-row')).toHaveLength(2);
    const info = within(screen.getByTestId('assembly-header'))
      .getByTestId('assembly-header-info').textContent;
    expect(info).toMatch(/48 bp/); // 24 + 24
    expect(info).toMatch(/2 сегм/);
  });

  it('Realise on the migrated zone → 2 PCR ops + 1 junction + 3 containers', () => {
    const migrated = migrateSnapshot(preT6Snapshot(), 7);
    const zid = migZone(migrated).id;
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: migrated }); });
    act(() => { A.openEditorAssemblyTab(zid); });
    expect(screen.getByTestId('assembly-mode-shell').getAttribute('data-draft-id')).toBe(zid);
    expect(screen.getAllByTestId('assembly-segment-row')).toHaveLength(2);
    const opsBefore = S.operations.length;
    const cntBefore = S.containers.length;
    expect(screen.getByTestId('assembly-realise-btn').disabled).toBe(false);
    act(() => { fireEvent.click(screen.getByTestId('assembly-realise-btn')); });
    const modal = screen.getByTestId('realise-modal');
    act(() => { fireEvent.click(within(modal).getByTestId('realise-confirm')); });
    expect(S.operations.length).toBe(opsBefore + 2);
    expect(S.junctions.length).toBe(1);
    expect(S.containers.length).toBe(cntBefore + 3);
  });

  it('idempotent — re-migrating an already-v8 snapshot is a no-op', () => {
    const once = migrateSnapshot(preT6Snapshot(), 7);
    const twice = migrateSnapshot(once, 7);
    expect(twice.zones).toHaveLength(once.zones.length); // no new zone
    expect(twice.pieces).toHaveLength(once.pieces.length);
    expect(twice.assemblyDrafts).toEqual([]);
  });
});
