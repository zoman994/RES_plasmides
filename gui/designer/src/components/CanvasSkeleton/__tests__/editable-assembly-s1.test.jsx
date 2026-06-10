/**
 * editable-assembly-s1.test.jsx — SPEC_EDITABLE_ASSEMBLY_S1 §7.5.
 *
 * Integration of the editable assembled view: AssemblyShellBody wires
 * the shared SequenceTab editable + onSequenceEdit, routes the edit op
 * through assembly-edit-router, dispatches the piece operation and moves
 * the caret. SequenceTab is mocked (mirrors assembly-primers /
 * pcr-mode-selection) so the test drives ONLY the shell↔router↔reducer
 * wiring via a controlled `EDIT.op`.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, vi, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';

// Controlled op the mock fires through onSequenceEdit on click.
const EDIT = { op: null };

vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => (
    <div
      data-testid="mock-seq-tab"
      data-editable={String(!!props.editable)}
      data-has-onseqedit={String(typeof props.onSequenceEdit === 'function')}
      data-caret-pos={String(props.caretPos)}
    >
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
import { bootstrapStore, useStore } from '../../../store';

afterEach(() => { cleanup(); EDIT.op = null; });
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';

function mount() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => {
    A.addContainer({
      id: 'cZ', kind: 'molecule', name: 'pUC', sequence: SEQ, annotations: [],
    });
  });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const fire = (op) => act(() => { EDIT.op = op; fireEvent.click(screen.getByTestId('fire-edit')); });

describe('editable wiring (§5.1)', () => {
  it('a clean assembly hands editable=true + an onSequenceEdit function to SequenceTab', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 4, false); });
    const tab = screen.getByTestId('mock-seq-tab');
    expect(tab.getAttribute('data-editable')).toBe('true');
    expect(tab.getAttribute('data-has-onseqedit')).toBe('true');
    expect(screen.queryByTestId('assembly-edit-disabled-banner')).toBeNull();
  });
});

describe('typing on a boundary → ONE block (§3, ATG)', () => {
  it('three sequential inserts grow a single snippet "ATG" and move the caret', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 4, false); }); // [0,4)
    act(() => { A.insertSegment(zid, 'cZ', 4, 8, false); }); // [4,8) — boundary at 4

    fire({ kind: 'insert', pos: 4, char: 'A' });
    // §5.8 — caret advanced to pos+1.
    expect(screen.getByTestId('mock-seq-tab').getAttribute('data-caret-pos')).toBe('5');
    fire({ kind: 'insert', pos: 5, char: 'T' });
    fire({ kind: 'insert', pos: 6, char: 'G' });

    const snippets = zonePieces(zid).filter((p) => p.kind === 'snippet');
    expect(snippets).toHaveLength(1);
    expect(snippets[0].sequence).toBe('ATG');
    // sourced neighbours untouched.
    expect(zonePieces(zid).filter((p) => p.kind === 'sourced')).toHaveLength(2);
  });
});

describe('snippet ↔ synthesis flip on the threshold (§5.4)', () => {
  it('typing past 80 nt flips the snippet block to synthesis', () => {
    const zid = mount();
    act(() => { A.insertSnippet(zid, { sequence: 'A'.repeat(80) }, undefined); });
    expect(zonePieces(zid)[0].kind).toBe('snippet');
    fire({ kind: 'insert', pos: 80, char: 'C' }); // → 81 nt
    const p = zonePieces(zid)[0];
    expect(p.kind).toBe('synthesis');
    expect(p.sequence.length).toBe(81);
  });
});

describe('editing inside an inline block (§5.4)', () => {
  it('Backspace inside a snippet trims its sequence', () => {
    const zid = mount();
    act(() => { A.insertSnippet(zid, { sequence: 'ATGC' }, undefined); }); // [0,4)
    fire({ kind: 'delete', pos: 2, length: 1 }); // delete the G
    expect(zonePieces(zid)[0].sequence).toBe('ATC');
  });

  it('deleting the last nucleotide removes the block (REMOVE_PIECE)', () => {
    const zid = mount();
    act(() => { A.insertSnippet(zid, { sequence: 'A' }, undefined); });
    expect(zonePieces(zid)).toHaveLength(1);
    fire({ kind: 'delete', pos: 0, length: 1 });
    expect(zonePieces(zid)).toHaveLength(0);
  });

  it('typing inside a sourced piece splits it and inserts a block (S2)', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); }); // sourced [0,8)
    fire({ kind: 'insert', pos: 4, char: 'A' });
    const post = zonePieces(zid);
    expect(post).toHaveLength(3);
    expect(post.map((p) => p.kind)).toEqual(['sourced', 'snippet', 'sourced']);
    expect(post[1].sequence).toBe('A');
    expect(post[0].ranges[0]).toMatchObject({ start: 0, end: 4 });
    expect(post[2].ranges[0]).toMatchObject({ start: 4, end: 8 });
  });
});

describe('editing a grouped piece disbands the group first (§5.6)', () => {
  it('group расформирована + warning toast + edit applied', () => {
    const zid = mount();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); }); // sourced [0,32)
    act(() => { A.insertSnippet(zid, { sequence: 'AAAA' }, undefined); }); // snippet [32,36)
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(1);

    // Type at the snippet's right edge (pos 36 — append).
    fire({ kind: 'insert', pos: 36, char: 'C' });

    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    expect(zonePieces(zid).every((p) => p.groupId === null)).toBe(true);
    const snippet = zonePieces(zid).find((p) => p.kind === 'snippet');
    expect(snippet.sequence).toBe('AAAAC');
    expect(S.toast && S.toast.kind).toBe('warning');
  });
});

describe('frozen / orphan gate read-only (§5.1)', () => {
  function frozenState() {
    const now = Date.now();
    return {
      containers: [{
        id: 'cF', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGG', annotations: [],
      }],
      positions: {},
      junctions: [],
      operations: [],
      pieces: [{
        id: 'pF',
        kind: 'sourced',
        name: 'frag',
        sourceIds: ['cF'],
        ranges: [{ sourceId: 'cF', start: 0, end: 8, orientation: 'forward' }],
        origin: 'selection',
        acquisitionMethod: 'undefined',
        acquisitionParams: {},
        color: '#888888',
        functionalLabel: null,
        zoneId: 'zF',
        order: null,
        variantGroupId: null,
        derivedReactionId: null,
        frozen: true, // executed-reaction freeze (§5.1)
        pinned: false,
        groupId: null,
        groupLayer: 0,
        mutations: [],
        createdAt: now,
        updatedAt: now,
      }],
      zones: [{
        id: 'zF', name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 }, viewMode: 'sequence',
      }],
    };
  }

  it('a frozen piece disables editing + shows the banner', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: frozenState() }); });
    act(() => { A.openEditorAssemblyTab('zF'); });
    const tab = screen.getByTestId('mock-seq-tab');
    expect(tab.getAttribute('data-editable')).toBe('false');
    expect(tab.getAttribute('data-has-onseqedit')).toBe('false');
    expect(screen.getByTestId('assembly-edit-disabled-banner')).toBeTruthy();
  });
});

describe('synthesisLengthThreshold store setting (§5.9)', () => {
  it('defaults to 80 and clamps to 40..200', () => {
    const st = useStore.getState();
    expect(st.displaySettings.synthesisLengthThreshold).toBe(80);
    act(() => { st.setDisplaySetting({ synthesisLengthThreshold: 500 }); });
    expect(useStore.getState().displaySettings.synthesisLengthThreshold).toBe(200);
    act(() => { st.setDisplaySetting({ synthesisLengthThreshold: 5 }); });
    expect(useStore.getState().displaySettings.synthesisLengthThreshold).toBe(40);
    act(() => { st.setDisplaySetting({ synthesisLengthThreshold: 120 }); });
    expect(useStore.getState().displaySettings.synthesisLengthThreshold).toBe(120);
  });
});
