/**
 * project-assembly-workspace.test.jsx — M-WORKSPACE K1.
 *
 * The two-level tab workspace: top tabs per assembly + a per-assembly view
 * switcher (Sequence / DAG / Праймеры / Pipeline) + the active body.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import ProjectAssemblyWorkspace from '../workspace/ProjectAssemblyWorkspace';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }
function mount() {
  render(<SkeletonProvider><H /><ProjectAssemblyWorkspace /></SkeletonProvider>);
}
const newZone = (name) => A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name, bounds: { x: 0, y: 0, width: 600, height: 400 } } });

describe('M-WORKSPACE K1 — ProjectAssemblyWorkspace', () => {
  it('empty: create button adds an assembly + focuses it + shows both tab strips', () => {
    mount();
    expect(screen.getByTestId('assembly-workspace-create')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('assembly-workspace-create')); });
    expect(S.zones).toHaveLength(1);
    expect(S.activeAssemblyId).toBe(S.zones[0].id);
    expect(screen.getByTestId('assembly-tab-strip')).toBeTruthy();
    expect(screen.getByTestId('assembly-view-tab-strip')).toBeTruthy();
  });

  it('renders one top tab per zone + the Sequence assembler body by default', () => {
    mount();
    act(() => { newZone('Сборка 1'); });
    const zid = S.zones[0].id;
    expect(screen.getByTestId(`assembly-tab-${zid}`)).toBeTruthy();
    expect(screen.getByTestId('assembly-mode-shell')).toBeTruthy();
  });

  it('switching the view tab to DAG renders the graph view + records assemblyViewByZone', () => {
    mount();
    act(() => { newZone('A'); });
    const zid = S.zones[0].id;
    act(() => { fireEvent.click(screen.getByTestId('assembly-view-tab-dag')); });
    expect(S.assemblyViewByZone[zid]).toBe('dag');
    expect(screen.getByTestId('assembly-dag-view')).toBeTruthy();
    expect(screen.queryByTestId('assembly-mode-shell')).toBeNull();
  });

  it('clicking a second assembly tab sets it active', () => {
    mount();
    act(() => { newZone('A'); });
    act(() => { newZone('B'); });
    const second = S.zones[1].id;
    act(() => { fireEvent.click(screen.getByTestId(`assembly-tab-${second}`)); });
    expect(S.activeAssemblyId).toBe(second);
  });
});
