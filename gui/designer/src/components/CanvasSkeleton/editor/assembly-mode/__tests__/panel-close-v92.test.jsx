/**
 * V92 — assembly editor right-rail / pipeline panels gain a close (×)
 * button. Биолог жаловался: «Палитра открывает Схема сборки + фильтр
 * + инспектор сегмента — закрыть никак, повторное нажатие Палитра не
 * убирает». Фикс: каждая панель получает свой close-контрол.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent, within,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../../../store/skeleton-context';
import EditorWindowShell from '../../EditorWindowShell';
import { bootstrapStore } from '../../../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openAssemblyWithTwoSegments() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cA', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => { A.addContainer({ id: 'cB', name: 'pET', sequence: 'GGGGGGGGTTTTTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'V92', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  act(() => { A.insertManualSegment(zid, { gapKind: 'unknown', length: 4 }, undefined); });
  act(() => { A.insertManualSegment(zid, { gapKind: 'unknown', length: 5 }, undefined); });
  return zid;
}

describe('V92 — close controls for assembly editor side panels', () => {
  it('AssemblyPipelinePanel has a close (×) button that hides the panel', () => {
    openAssemblyWithTwoSegments();
    const panel = screen.getByTestId('assembly-pipeline-panel');
    const close = within(panel).getByTestId('assembly-pipeline-panel-close');
    expect(close).toBeTruthy();
    act(() => { fireEvent.click(close); });
    expect(screen.queryByTestId('assembly-pipeline-panel')).toBeNull();
  });

  it('AssemblySidebar has a close (×) button that hides it', () => {
    openAssemblyWithTwoSegments();
    const sidebar = screen.getByTestId('assembly-sidebar');
    const close = within(sidebar).getByTestId('assembly-sidebar-close');
    expect(close).toBeTruthy();
    act(() => { fireEvent.click(close); });
    expect(screen.queryByTestId('assembly-sidebar')).toBeNull();
  });

  it('AssemblyPrimersPanel has a close (×) button that hides it', () => {
    openAssemblyWithTwoSegments();
    const primers = screen.getByTestId('assembly-primers-panel');
    const close = within(primers).getByTestId('assembly-primers-panel-close');
    expect(close).toBeTruthy();
    act(() => { fireEvent.click(close); });
    expect(screen.queryByTestId('assembly-primers-panel')).toBeNull();
  });

  it('«⊞ панели» restores the hidden panels (M-CIRCULARIZE — was «Палитра»)', () => {
    openAssemblyWithTwoSegments();
    // hide all three
    act(() => { fireEvent.click(screen.getByTestId('assembly-pipeline-panel-close')); });
    act(() => { fireEvent.click(screen.getByTestId('assembly-sidebar-close')); });
    act(() => { fireEvent.click(screen.getByTestId('assembly-primers-panel-close')); });
    expect(screen.queryByTestId('assembly-pipeline-panel')).toBeNull();
    expect(screen.queryByTestId('assembly-sidebar')).toBeNull();
    expect(screen.queryByTestId('assembly-primers-panel')).toBeNull();

    // the restore-panels control (shown only while something is hidden) brings all back
    act(() => { fireEvent.click(screen.getByTestId('assembly-restore-panels')); });
    expect(screen.getByTestId('assembly-pipeline-panel')).toBeTruthy();
    expect(screen.getByTestId('assembly-sidebar')).toBeTruthy();
    expect(screen.getByTestId('assembly-primers-panel')).toBeTruthy();
  });
});
