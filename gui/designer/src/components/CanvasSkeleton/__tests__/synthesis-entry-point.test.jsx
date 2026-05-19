/**
 * synthesis-entry-point.test.jsx — M-CANVAS-WORKFLOW-UX K4.
 *
 * Entry-point «+ Синтез» (SPEC §3.1.C): SynthesisModal (name + seq +
 * live length/GC + mode radio) → INSERT_SYNTHESIS kind='synthesis'
 * piece (inline) OR a real container + sourced piece (save-as-container).
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
import SynthesisModal from '../editor/assembly-mode/SynthesisModal';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
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

describe('K4 — INSERT_SYNTHESIS reducer/adapter', () => {
  it('INSERT_SYNTHESIS on a zone → kind=synthesis piece with inline sequence', () => {
    const zid = openEmptyZone();
    act(() => { A.insertSynthesis(zid, { sequence: 'ATGAAACCCGGG', name: 'Hyg' }); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('synthesis');
    expect(ps[0].sequence).toBe('ATGAAACCCGGG');
    expect(ps[0].name).toBe('Hyg');
  });
});

describe('K4 — SynthesisModal', () => {
  it('live length + GC; invalid/empty disables Добавить', () => {
    render(<SynthesisModal onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('synthesis-add').disabled).toBe(true);
    act(() => {
      fireEvent.change(screen.getByTestId('synthesis-seq'), { target: { value: 'GGCC' } });
    });
    expect(screen.getByTestId('synthesis-stats').textContent).toMatch(/4/);
    expect(screen.getByTestId('synthesis-stats').textContent).toMatch(/100/); // GC%
    expect(screen.getByTestId('synthesis-add').disabled).toBe(false);
    act(() => {
      fireEvent.change(screen.getByTestId('synthesis-seq'), { target: { value: 'ATXZ' } });
    });
    expect(screen.getByTestId('synthesis-add').disabled).toBe(true);
  });

  it('Добавить fires onConfirm with sequence/name/mode (inline default)', () => {
    let got = null;
    render(<SynthesisModal onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByTestId('synthesis-name'), { target: { value: 'cassette' } });
      fireEvent.change(screen.getByTestId('synthesis-seq'), { target: { value: 'atgccc' } });
    });
    act(() => { fireEvent.click(screen.getByTestId('synthesis-add')); });
    expect(got).toMatchObject({ sequence: 'ATGCCC', name: 'cassette', mode: 'inline' });
  });

  it('mode radio → container; Esc → onCancel', () => {
    let got = null;
    let cancelled = false;
    render(<SynthesisModal onConfirm={(p) => { got = p; }} onCancel={() => { cancelled = true; }} />);
    act(() => {
      fireEvent.change(screen.getByTestId('synthesis-seq'), { target: { value: 'ACGTACGT' } });
      fireEvent.click(screen.getByTestId('synthesis-mode-container'));
      fireEvent.click(screen.getByTestId('synthesis-add'));
    });
    expect(got.mode).toBe('container');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(cancelled).toBe(true);
  });
});

describe('K4 — «+ Синтез» toolbar integration', () => {
  it('inline mode → synthesis piece in the zone', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-synthesis')); });
    const m = screen.getByTestId('synthesis-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('synthesis-seq'), { target: { value: 'TTTTGGGGCCCC' } });
    });
    act(() => { fireEvent.click(within(m).getByTestId('synthesis-add')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('synthesis');
    expect(ps[0].sequence).toBe('TTTTGGGGCCCC');
  });

  it('save-as-container mode → a new container + a sourced piece', () => {
    const zid = openEmptyZone();
    const cBefore = S.containers.length;
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-synthesis')); });
    const m = screen.getByTestId('synthesis-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('synthesis-name'), { target: { value: 'HygR' } });
      fireEvent.change(within(m).getByTestId('synthesis-seq'), { target: { value: 'AAAACCCCGGGGTTTT' } });
      fireEvent.click(within(m).getByTestId('synthesis-mode-container'));
    });
    act(() => { fireEvent.click(within(m).getByTestId('synthesis-add')); });
    expect(S.containers.length).toBe(cBefore + 1);
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('sourced');
    expect(ps[0].ranges[0]).toMatchObject({ start: 0, end: 16 });
  });
});
