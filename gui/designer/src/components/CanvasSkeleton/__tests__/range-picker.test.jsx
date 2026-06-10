/**
 * range-picker.test.jsx — M-CANVAS-WORKFLOW-UX K5.
 *
 * «+ Плазмида»: PlaceholderTreePicker (plasmid) → RangePickerModal
 * (mini read-only SequenceView + numeric start/end + features dropdown
 * + RC) → sourced piece with the chosen range (SPEC §3.1.A). Drop of a
 * canvas container also routes through the range picker.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import RangePickerModal from '../editor/assembly-mode/RangePickerModal';
import { bootstrapStore, useStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  // PlaceholderTreePicker persists Recent/Favorites in localStorage —
  // clear so a prior test's recordRecent doesn't render the same entry
  // twice (once in Недавно, once in Коллекция) breaking getByTestId.
  try { localStorage.clear(); } catch { /* no-op */ }
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

const SRC = {
  name: 'pUC19', sequence: 'AAAACCCCGGGGTTTT', circular: true,
  annotations: [{ start: 4, end: 12, label: 'ori' }],
};

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', name: 'pUC19', kind: 'molecule', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZT', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid);

function seedLib() {
  act(() => {
    useStore.setState((s) => ({
      ...s,
      libraryEntries: {
        'lib-puc': {
          id: 'lib-puc', kind: 'container', name: 'pUC19',
          payload: { sequence: 'AAAACCCCGGGGTTTT', topology: 'circular', annotations: [{ start: 4, end: 12, label: 'ori' }] },
        },
      },
      projects: {},
      currentProjectId: null,
    }));
  });
}

describe('K5 — RangePickerModal', () => {
  it('renders mini viewer + numeric start/end (default 0..len) + RC + features dropdown', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('range-picker-modal')).toBeTruthy();
    expect(screen.getByTestId('range-picker-viewer')).toBeTruthy();
    // V127 — start input 1-based: default position 1 (store 0).
    expect(screen.getByTestId('range-picker-start').value).toBe('1');
    expect(screen.getByTestId('range-picker-end').value).toBe('16');
    expect(screen.getByTestId('range-picker-rc')).toBeTruthy();
    // features dropdown built from annotations
    expect(within(screen.getByTestId('range-picker-feature')).getByText(/ori \(5-12\)/)).toBeTruthy(); // V127 — 1-based label
  });

  it('numeric range + RC → onConfirm({start,end,rc})', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => {
      // V127 — inputs 1-based: typed start 2 → store 1; end 10 passes through.
      fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '2' } });
      fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '10' } });
      fireEvent.click(screen.getByTestId('range-picker-rc'));
    });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    // V88/V89 — confirm payload теперь несёт acquisitionMethod.
    expect(got).toMatchObject({ start: 1, end: 10, rc: true });
    expect(got.acquisitionMethod).toBe('numeric');
  });

  it('feature dropdown select → start/end snap to that feature', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByTestId('range-picker-feature'), { target: { value: '0' } });
    });
    // V127 — feature {4,12} displays 1-based 5..12; store stays 4..12.
    expect(screen.getByTestId('range-picker-start').value).toBe('5');
    expect(screen.getByTestId('range-picker-end').value).toBe('12');
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got).toMatchObject({ start: 4, end: 12, rc: false });
    expect(got.acquisitionMethod).toBe('feature');
  });

  it('Esc → onCancel', () => {
    let cancelled = false;
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => { cancelled = true; }} />);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(cancelled).toBe(true);
  });
});

describe('K5 — «+ Плазмида» integration', () => {
  it('pick library entry → RangePicker → confirm default → full-length sourced piece', async () => {
    const zid = openEmptyZone();
    seedLib();
    // Игорь 20.05.2026 — empty assembly now shows the inline library
    // picker directly (EmptyAssemblyLibrary). No more «+ Плазмида» step.
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('sourced');
    expect(ps[0].ranges[0]).toMatchObject({ start: 0, end: 16 });
  });

  it('chosen sub-range is respected', async () => {
    const zid = openEmptyZone();
    seedLib();
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('range-picker-start'), { target: { value: '4' } });
      fireEvent.change(within(m).getByTestId('range-picker-end'), { target: { value: '12' } });
    });
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const ps = zonePieces(zid);
    expect(ps[0].ranges[0]).toMatchObject({ start: 3, end: 12 }); // V127 — typed start 4 (1-based) → store 3
  });

  it('drop a canvas container onto the viewer → RangePicker → confirm → sourced piece', () => {
    const zid = openEmptyZone();
    const dt = (() => { const st = {}; return { setData: (k, v) => { st[k] = String(v); }, getData: (k) => st[k] || '', effectAllowed: 'copy' }; })();
    dt.setData('application/x-bodge-container-id', 'cZ');
    const wrap = screen.getByTestId('assembly-viewer-wrap');
    act(() => { fireEvent.dragOver(wrap, { dataTransfer: dt }); });
    act(() => { fireEvent.drop(wrap, { dataTransfer: dt }); });
    const m = screen.getByTestId('range-picker-modal');
    act(() => { fireEvent.click(within(m).getByTestId('range-picker-confirm')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('sourced');
    expect(ps[0].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 16 });
  });
});
