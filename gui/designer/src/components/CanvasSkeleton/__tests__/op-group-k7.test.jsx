/**
 * op-group-k7.test.jsx — M-CANVAS-WORKFLOW-UX K7.
 *
 * CREATE_OP_GROUP / REMOVE_OP_GROUP reducer + OpGroupPicker modal +
 * SegmentList per-row selection + «🔗 Сшить» button (SPEC §3 Шаг 2).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act, within,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import OpGroupPicker from '../editor/assembly-mode/OpGroupPicker';
import SegmentList from '../editor/assembly-mode/SegmentList';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openZoneWithPieces() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', name: 'pUC', kind: 'molecule', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  // 3 contiguous sourced pieces.
  act(() => { A.insertSegment(zid, 'cZ', 0, 4, false); });
  act(() => { A.insertSegment(zid, 'cZ', 4, 8, false); });
  act(() => { A.insertSegment(zid, 'cZ', 8, 12, false); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

describe('K7 — CREATE_OP_GROUP / REMOVE_OP_GROUP reducer', () => {
  it('creates op with isOpGroup=true + sets piece.groupId on every input', () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', 'layer1', [ids[0], ids[1]]); });
    const op = S.operations.find((o) => o.isOpGroup);
    expect(op).toBeTruthy();
    expect(op.kind).toBe('overlap_pcr');
    expect(op.zoneId).toBe(zid);
    expect(op.inputPieces).toEqual([ids[0], ids[1]]);
    const post = zonePieces(zid);
    expect(post[0].groupId).toBe(op.id);
    expect(post[1].groupId).toBe(op.id);
    expect(post[2].groupId).toBeNull();
  });

  it('rejects a 1-piece group (no-op)', () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0]]); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
  });

  it('rejects a non-continuous selection (no-op)', () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0], ids[2]]); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    expect(zonePieces(zid).every((p) => p.groupId == null)).toBe(true);
  });

  it('rejects already-grouped pieces (no-op)', () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0], ids[1]]); });
    act(() => { A.createOpGroup(zid, 'gibson', '', [ids[1], ids[2]]); });
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(1);
  });

  it('REMOVE_OP_GROUP removes op + clears groupId on its inputs', () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0], ids[1]]); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    act(() => { A.removeOpGroup(opId); });
    expect(S.operations.find((o) => o.id === opId)).toBeUndefined();
    expect(zonePieces(zid).every((p) => p.groupId == null)).toBe(true);
  });
});

describe('K7 — OpGroupPicker modal', () => {
  it('renders kind radios with auto-suggest: linear final → overlap_pcr selected', () => {
    render(<OpGroupPicker pieceIds={['a', 'b', 'c']} zoneFinalTopology="linear" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('op-group-picker-modal')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-overlap_pcr')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-gibson')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-overlap_pcr').checked).toBe(true);
  });

  it('auto-suggest for circular final with many pieces → overlap_pcr (intermediate layer)', () => {
    render(<OpGroupPicker pieceIds={['a', 'b', 'c', 'd', 'e', 'f', 'g']} zoneFinalTopology="circular" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('op-group-kind-overlap_pcr').checked).toBe(true);
  });

  it('Confirm fires onConfirm({kind,name})', () => {
    let got = null;
    render(<OpGroupPicker pieceIds={['a', 'b']} zoneFinalTopology="circular" onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('op-group-kind-gibson')); });
    act(() => {
      fireEvent.change(screen.getByTestId('op-group-name'), { target: { value: 'final' } });
      fireEvent.click(screen.getByTestId('op-group-confirm'));
    });
    expect(got).toEqual({ kind: 'gibson', name: 'final' });
  });
});

describe('K7 — SegmentList selection', () => {
  const SEGS = [
    { id: 's1', source: { type: 'manual' }, sequence: 'A', length: 1 },
    { id: 's2', source: { type: 'manual' }, sequence: 'C', length: 1 },
  ];
  const BOUNDS = SEGS.map((s, i) => ({ segmentId: s.id, startOnAssembly: i, endOnAssembly: i + 1 }));
  const DRAFT = { id: 'd', name: 'd', segments: SEGS, topology: { circular: false } };

  it('per-row checkbox toggles selection; «Сшить» appears at ≥2 selected', () => {
    let picked = new Set();
    const onToggleSelect = (id) => {
      if (picked.has(id)) picked.delete(id); else picked.add(id);
    };
    const { rerender } = render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          selectedSegmentIds={picked}
          onToggleSelect={onToggleSelect}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('segment-select-s1')).toBeTruthy();
    expect(screen.queryByTestId('segment-list-sew')).toBeNull();

    act(() => { fireEvent.click(screen.getByTestId('segment-select-s1')); });
    picked = new Set([...picked]);
    rerender(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          selectedSegmentIds={picked}
          onToggleSelect={onToggleSelect}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    expect(screen.queryByTestId('segment-list-sew')).toBeNull();

    act(() => { fireEvent.click(screen.getByTestId('segment-select-s2')); });
    picked = new Set([...picked]);
    rerender(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          selectedSegmentIds={picked}
          onToggleSelect={onToggleSelect}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('segment-list-sew')).toBeTruthy();
  });
});

describe('K7 — toolbar integration: select → Сшить → picker → confirm', () => {
  it('full flow: 2 pieces selected → Сшить → picker → confirm → op-group exists', async () => {
    const zid = openZoneWithPieces();
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { fireEvent.click(screen.getByTestId(`segment-select-${ids[0]}`)); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-select-${ids[1]}`)); });
    act(() => { fireEvent.click(screen.getByTestId('segment-list-sew')); });
    const m = await screen.findByTestId('op-group-picker-modal');
    act(() => { fireEvent.click(within(m).getByTestId('op-group-confirm')); });
    const op = S.operations.find((o) => o.isOpGroup);
    expect(op).toBeTruthy();
    expect(op.inputPieces).toEqual([ids[0], ids[1]]);
    expect(zonePieces(zid)[0].groupId).toBe(op.id);
  });
});
