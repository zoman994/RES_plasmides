/**
 * V90 — assembly tab label «(пустой)» fix.
 * Tab открыт на zone id, но EditorTabStrip искал draft только в
 * state.assemblyDrafts (legacy slice) и падал на placeholder. Должен
 * dual-resolve через `selectAssemblyTarget` так же, как
 * AssemblyModeShell + SegmentDetailPanel.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../../store/skeleton-context';
import EditorWindowShell from '../EditorWindowShell';
import { bootstrapStore } from '../../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('V90 — editor tab label resolves zone-based assembly', () => {
  it('zone-based assembly tab shows zone name (not «(пустой)»)', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'Сборка 1', bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => { A.openEditorAssemblyTab(zid); });
    const tab = screen.getByTestId('editor-tab');
    expect(tab.getAttribute('data-tab-kind')).toBe('assembly');
    expect(tab.textContent).toMatch(/Сборка 1/);
    expect(tab.textContent).not.toMatch(/\(пустой\)/);
  });

  it('legacy assemblyDrafts path still resolves to draft.name', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'legacy-asm', name: 'Legacy V90' }); });
    act(() => { A.openEditorAssemblyTab('legacy-asm'); });
    const tab = screen.getByTestId('editor-tab');
    expect(tab.textContent).toMatch(/Legacy V90/);
  });

  it('only renders «(пустой)» when neither zone nor draft resolves', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    // Open an assembly tab on a totally unknown id — neither zones nor
    // assemblyDrafts have it. Label MUST fall back to the placeholder.
    act(() => { A.openEditorAssemblyTab('unknown-orphan-id'); });
    const tab = screen.getByTestId('editor-tab');
    expect(tab.textContent).toMatch(/\(пустой\)/);
  });
});
