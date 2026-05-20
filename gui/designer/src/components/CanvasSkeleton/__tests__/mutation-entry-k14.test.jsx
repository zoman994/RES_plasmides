/**
 * mutation-entry-k14.test.jsx — M-CANVAS-WORKFLOW-UX K14.
 *
 * ADD_PIECE_MUTATION reducer + MutationModal + per-row «+ mut» entry
 * in SegmentList (sourced pieces only). K11 already applies mutations
 * to the binding (mutagenic primer); K14 is the data + UI to author.
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
import MutationModal from '../editor/assembly-mode/MutationModal';
import SegmentList from '../editor/assembly-mode/SegmentList';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openZoneWithSourced() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
  const pid = S.pieces.find((p) => p.zoneId === zid).id;
  return { zid, pid };
}

describe('K14 — ADD_PIECE_MUTATION reducer', () => {
  it('appends a mutation to piece.mutations[]', () => {
    const { pid } = openZoneWithSourced();
    act(() => { A.addPieceMutation(pid, { position: 5, fromBase: 'C', toBase: 'T', kind: 'silent' }); });
    const p = S.pieces.find((x) => x.id === pid);
    expect(p.mutations).toHaveLength(1);
    expect(p.mutations[0]).toMatchObject({ position: 5, fromBase: 'C', toBase: 'T', kind: 'silent' });
  });

  it('idempotent for the same position: replaces in-place (no duplicate)', () => {
    const { pid } = openZoneWithSourced();
    act(() => { A.addPieceMutation(pid, { position: 5, fromBase: 'C', toBase: 'T' }); });
    act(() => { A.addPieceMutation(pid, { position: 5, fromBase: 'C', toBase: 'G' }); });
    const p = S.pieces.find((x) => x.id === pid);
    expect(p.mutations).toHaveLength(1);
    expect(p.mutations[0].toBase).toBe('G');
  });
});

describe('K14 — MutationModal', () => {
  it('renders position + fromBase + toBase + kind + notes', () => {
    render(
      <MutationModal
        sourceName="pUC19"
        defaultPosition={234}
        fromBase="C"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('mutation-modal')).toBeTruthy();
    expect(screen.getByTestId('mutation-position').value).toBe('234');
    expect(screen.getByTestId('mutation-frombase').textContent).toMatch(/C/);
    expect(screen.getByTestId('mutation-tobase')).toBeTruthy();
    expect(screen.getByTestId('mutation-kind-silent')).toBeTruthy();
    expect(screen.getByTestId('mutation-notes')).toBeTruthy();
  });

  it('Apply fires onConfirm with the payload', () => {
    let got = null;
    render(
      <MutationModal
        sourceName="pUC19"
        defaultPosition={234}
        fromBase="C"
        onConfirm={(m) => { got = m; }}
        onCancel={() => {}}
      />,
    );
    act(() => {
      fireEvent.change(screen.getByTestId('mutation-tobase'), { target: { value: 'T' } });
      fireEvent.click(screen.getByTestId('mutation-kind-missense'));
      fireEvent.change(screen.getByTestId('mutation-notes'), { target: { value: 'K77E' } });
      fireEvent.click(screen.getByTestId('mutation-apply'));
    });
    expect(got).toMatchObject({
      position: 234, fromBase: 'C', toBase: 'T', kind: 'missense', notes: 'K77E',
    });
  });

  it('Esc cancels', () => {
    let cancelled = false;
    render(
      <MutationModal
        sourceName="x"
        defaultPosition={0}
        fromBase="A"
        onConfirm={() => {}}
        onCancel={() => { cancelled = true; }}
      />,
    );
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(cancelled).toBe(true);
  });
});

describe('K14 — SegmentList «+ mut» entry', () => {
  const sourcedSeg = {
    id: 's1', source: { type: 'container', containerId: 'cA', sourceContainerName: 'pUC' },
    sequence: 'AAAA', length: 4, pieceKind: 'sourced', start: 0, end: 4,
  };
  const gapSeg = { id: 's2', source: { type: 'manual' }, sequence: '', length: 5, pieceKind: 'gap' };
  const BOUNDS = [
    { segmentId: 's1', startOnAssembly: 0, endOnAssembly: 4 },
    { segmentId: 's2', startOnAssembly: 4, endOnAssembly: 9 },
  ];
  const DRAFT = { id: 'd', name: 'd', segments: [sourcedSeg, gapSeg], topology: { circular: false } };

  it('«+ mut» button shown ONLY for sourced rows', () => {
    let mutOpenedFor = null;
    render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          onSelectSegment={() => {}}
          onAddMutation={(id) => { mutOpenedFor = id; }}
        />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('assembly-segment-add-mut-s1')).toBeTruthy();
    expect(screen.queryByTestId('assembly-segment-add-mut-s2')).toBeNull();
    act(() => { fireEvent.click(screen.getByTestId('assembly-segment-add-mut-s1')); });
    expect(mutOpenedFor).toBe('s1');
  });
});

describe('K14 — integration: «+ mut» → MutationModal → ADD_PIECE_MUTATION', () => {
  it('opens modal, applies → piece.mutations populated → 💎 badge appears', () => {
    const { pid } = openZoneWithSourced();
    act(() => { fireEvent.click(screen.getByTestId(`assembly-segment-add-mut-${pid}`)); });
    const m = screen.getByTestId('mutation-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('mutation-position'), { target: { value: '7' } });
      fireEvent.change(within(m).getByTestId('mutation-tobase'), { target: { value: 'T' } });
      fireEvent.click(within(m).getByTestId('mutation-apply'));
    });
    const p = S.pieces.find((x) => x.id === pid);
    expect(p.mutations).toHaveLength(1);
    expect(p.mutations[0]).toMatchObject({ position: 7, toBase: 'T' });
    expect(screen.getByTestId('segment-mutation-badge')).toBeTruthy();
  });
});
