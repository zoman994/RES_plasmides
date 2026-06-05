/**
 * editable-assembly-s3.test.jsx — SPEC_EDITABLE_ASSEMBLY_S3 §6 / §7.6.
 *
 * Integration of saved-primer coordinate maintenance: an editable-view
 * edit (through AssemblyShellBody.onSequenceEdit, SequenceTab mocked)
 * dispatches SHIFT_ASSEMBLY_PRIMERS — primers right of the edit shift,
 * an edit inside a primer's region marks it stale (⚠ in the panel), and
 * an auto-group's auto-primers vanish when the group disbands on edit.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, vi, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';

const EDIT = { op: null };

vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => (
    <div data-testid="mock-seq-tab" data-editable={String(!!props.editable)}>
      <button
        type="button"
        data-testid="fire-edit"
        onClick={() => props.onSequenceEdit && props.onSequenceEdit(EDIT.op)}
      >edit</button>
    </div>
  ),
}));

import EditorWindowShell from '../editor/EditorWindowShell';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';

afterEach(() => { cleanup(); EDIT.op = null; });
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

const SEQ40 = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCC'; // 40 bp

function mount() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', kind: 'molecule', name: 'pUC', sequence: SEQ40, annotations: [] }); });
  act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  // two sourced pieces spanning [0,20) + [20,40)
  act(() => { A.insertSegment(zid, 'cZ', 0, 20, false); });
  act(() => { A.insertSegment(zid, 'cZ', 20, 40, false); });
  return zid;
}
const primersOf = (zid) => (S.assemblyDraftPrimers && S.assemblyDraftPrimers[zid]) || [];
// JUNCTION 1b — the finalizer now derives auto primers on add, so the pool also
// holds auto-group primers (no source coords). The SAVED (WRITE) primer is the
// one carrying selection coordinates; find it by that, not by index.
const savedPrimer = (zid) => primersOf(zid)
  .find((p) => p.source && Number.isFinite(p.source.selectionStart));
const fire = (op) => act(() => { EDIT.op = op; fireEvent.click(screen.getByTestId('fire-edit')); });

describe('S3 — saved primer coordinate shift', () => {
  it('typing before a primer shifts its coordinates; sequence/status kept', () => {
    const zid = mount();
    act(() => { A.writeAssemblyPrimer({ draftId: zid, range: { start: 20, end: 38 }, direction: 'forward' }); });
    const before = savedPrimer(zid);
    expect(before.source.selectionStart).toBe(20);

    fire({ kind: 'insert', pos: 0, char: 'A' }); // new block at the very start → everything +1

    const after = savedPrimer(zid);
    expect(after.source.selectionStart).toBe(21);
    expect(after.source.selectionEnd).toBe(39);
    expect(after.status).not.toBe('stale');
  });
});

describe('S3 — edit inside a primer marks it stale', () => {
  it('an edit landing inside the binding region flags ⚠ and keeps coordinates', () => {
    const zid = mount();
    act(() => { A.writeAssemblyPrimer({ draftId: zid, range: { start: 20, end: 38 }, direction: 'forward' }); });

    fire({ kind: 'insert', pos: 30, char: 'A' }); // 20 < 30 < 38 → inside the primer

    const after = savedPrimer(zid);
    expect(after.status).toBe('stale');
    expect(after.source.selectionStart).toBe(20); // coordinates untouched
    expect(screen.getByTestId('assembly-primer-stale')).toBeTruthy();
  });
});

describe('S3 — editing a grouped piece disbands the group, keeps junction primers (J11)', () => {
  it('disband on edit tears down the group but the primers persist (junction-owned)', () => {
    const zid = mount();
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(1);
    expect(primersOf(zid).length).toBeGreaterThan(0);

    // type inside the first (grouped) piece → split + disband
    fire({ kind: 'insert', pos: 5, char: 'A' });

    // J11: the group is disbanded, but primers are junction-owned → not dropped
    // (the finalizer re-derives for the now-split pieces).
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    expect(primersOf(zid).length).toBeGreaterThan(0);
  });
});
