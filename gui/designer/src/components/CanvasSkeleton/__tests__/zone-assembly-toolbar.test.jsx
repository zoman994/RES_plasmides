/**
 * zone-assembly-toolbar.test.jsx — T6 K9.
 *
 * AssemblyHeader / AssemblySidebar / AssemblyToolbar are prop-driven
 * (no draft/zone coupling) — they need no migration; this verifies the
 * zone-mode integration: «+ Сегмент» picker, «+ Gap», sidebar drag, and
 * undo all route through the K8 zone-write adapter on a zone target.
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
import { bootstrapStore, useStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

const SRC = {
  id: 'cZ', name: 'pUC19', kind: 'molecule',
  sequence: 'AAAACCCCGGGGTTTT', annotations: [],
};

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer(SRC); });
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

function dt() {
  const store = {};
  return {
    setData: (k, v) => { store[k] = String(v); },
    getData: (k) => store[k] || '',
    effectAllowed: 'copy',
  };
}

describe('T6 K9 — toolbar / picker / sidebar / undo in zone-mode', () => {
  it('«+ Плазмида» → PlaceholderTreePicker → RangePicker → confirm → sourced piece (K5)', async () => {
    try { localStorage.clear(); } catch { /* no-op */ }
    const zid = openEmptyZone();
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: {
          'lib-z': {
            id: 'lib-z', kind: 'container', name: 'pUC-lib',
            payload: { sequence: 'AAAACCCCGGGGTTTT', topology: 'linear' },
          },
        },
        projects: {},
        currentProjectId: null,
      }));
    });
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-segment')); });
    expect(screen.getByTestId('skeleton-placeholder-picker')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('skeleton-placeholder-picker-item-lib-z')); });
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

  it('«+ Gap» unknown length → a gap piece in the zone', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-tab-unknown')); });
    act(() => { fireEvent.change(within(m).getByTestId('gap-unknown-len'), { target: { value: '15' } }); });
    act(() => { fireEvent.click(within(m).getByTestId('gap-insert')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('gap');
    expect(ps[0].gapLength).toBe(15);
  });

  it('drag a sidebar container onto the viewer → RangePicker → confirm → full-length piece (K5)', () => {
    const zid = openEmptyZone();
    const data = dt();
    data.setData('application/x-bodge-container-id', 'cZ');
    const wrap = screen.getByTestId('assembly-viewer-wrap');
    act(() => { fireEvent.dragOver(wrap, { dataTransfer: data }); });
    act(() => { fireEvent.drop(wrap, { dataTransfer: data }); });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 16 });
  });

  it('undo removes a zone-mode inserted piece', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-tab-unknown')); });
    act(() => { fireEvent.change(within(m).getByTestId('gap-unknown-len'), { target: { value: '12' } }); });
    act(() => { fireEvent.click(within(m).getByTestId('gap-insert')); });
    expect(zonePieces(zid)).toHaveLength(1);
    act(() => { fireEvent.click(screen.getByTestId('assembly-undo')); });
    expect(zonePieces(zid)).toHaveLength(0);
  });
});
