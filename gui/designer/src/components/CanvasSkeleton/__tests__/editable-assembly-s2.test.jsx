/**
 * editable-assembly-s2.test.jsx — SPEC_EDITABLE_ASSEMBLY_S2 §6 / §7.6.
 *
 * Integration of the S2 router branches through AssemblyShellBody's
 * onSequenceEdit handler (SequenceTab mocked, same EDIT.op driver as S1):
 *  - typing inside a sourced piece → 3 blocks, parents preserved
 *  - selection + Delete across a boundary → edges trimmed, middle removed
 *  - equal-length replace → mutations, assembled view shows the new base
 *  - mid delete → two sourced halves
 *  - editing a grouped piece disbands the group first
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
import { computeAssemblySequence } from '../lib/assembly-model';
import { selectZoneAsDraftLike } from '../store/selectors-pieces';

afterEach(() => { cleanup(); EDIT.op = null; });
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

// AAAA CCCC GGGG TTTT
const SEQ = 'AAAACCCCGGGGTTTT';

function mount() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', kind: 'molecule', name: 'pUC', sequence: SEQ, annotations: [] }); });
  act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const assembled = (zid) => computeAssemblySequence(selectZoneAsDraftLike(S, zid)).sequence;
const fire = (op) => act(() => { EDIT.op = op; fireEvent.click(screen.getByTestId('fire-edit')); });

describe('S2 — split-insert (typing inside a sourced piece)', () => {
  it('splits into [left][block][right]; halves keep their source ranges', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); }); // sourced [0,8)
    fire({ kind: 'insert', pos: 3, char: 'T' });
    const post = zonePieces(zid);
    expect(post.map((p) => p.kind)).toEqual(['sourced', 'snippet', 'sourced']);
    expect(post[0].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 3 });
    expect(post[2].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 3, end: 8 });
    expect(assembled(zid)).toBe('AAATACCCC'); // AAA + T + ACCCC (container[3..8))
  });
});

describe('S2 — spanning Delete', () => {
  it('selection + Delete across a boundary trims the edges and removes the middle', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 4, false); }); // [0,4) AAAA
    act(() => { A.insertSegment(zid, 'cZ', 4, 8, false); }); // [4,8) CCCC
    act(() => { A.insertSegment(zid, 'cZ', 8, 12, false); }); // [8,12) GGGG
    // assembled = AAAACCCCGGGG; select [2,10) and Delete
    fire({ kind: 'replace', start: 2, end: 10, replacement: '' });
    const post = zonePieces(zid);
    expect(post).toHaveLength(2);
    expect(post.every((p) => p.kind === 'sourced')).toBe(true);
    expect(post[0].ranges[0]).toMatchObject({ start: 0, end: 2 }); // AA
    expect(post[1].ranges[0]).toMatchObject({ start: 10, end: 12 }); // GG
    expect(assembled(zid)).toBe('AAGG');
  });
});

describe('S2 — substitution (equal-length replace)', () => {
  it('writes mutations and the assembled view shows the new base', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); }); // AAAACCCC
    fire({ kind: 'replace', start: 1, end: 2, replacement: 'G' }); // pos 1 A→G
    const post = zonePieces(zid);
    expect(post).toHaveLength(1); // no split — substitution
    expect(post[0].mutations).toEqual([expect.objectContaining({ position: 1, toBase: 'G' })]);
    expect(assembled(zid)).toBe('AGAACCCC');
  });
});

describe('S2 — mid delete', () => {
  it('deleting in the middle of a sourced piece yields two sourced halves', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); }); // AAAACCCC
    fire({ kind: 'delete', pos: 3, length: 2 }); // delete [3,5)
    const post = zonePieces(zid);
    expect(post).toHaveLength(2);
    expect(post[0].ranges[0]).toMatchObject({ start: 0, end: 3 });
    expect(post[1].ranges[0]).toMatchObject({ start: 5, end: 8 });
    expect(assembled(zid)).toBe('AAACCC'); // AAA + CCC
  });
});

describe('S2 — disband on edit of a grouped piece', () => {
  it('splitting a grouped piece расформировывает the group first', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); });
    act(() => { A.insertSegment(zid, 'cZ', 8, 12, false); });
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(1);
    // type inside the first (grouped) sourced piece → split + disband
    fire({ kind: 'insert', pos: 4, char: 'A' });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    expect(zonePieces(zid).every((p) => p.groupId === null)).toBe(true);
  });
});
