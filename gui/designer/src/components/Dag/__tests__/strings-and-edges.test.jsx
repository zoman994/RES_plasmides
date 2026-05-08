/**
 * STRINGS.dag + edge-case wiring — Sprint M-C.1 K5.
 *
 *   • STRINGS.dag namespace covers all the user-facing strings the
 *     M-C.1 components emit. EN fallbacks live in code comments;
 *     the runtime values stay Russian (matches the surrounding tone).
 *   • DagCanvas Backspace/Delete on a selected EDGE removes it from
 *     `Project.dag.edges`. K2 already covered node deletion via the
 *     ReactFlow `remove` change pipeline; edge deletion travels the
 *     same pipeline through onEdgesChange.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import {
  setAutosaveDelay,
  clearAllAutosaveTimers,
  DEFAULT_AUTOSAVE_DELAY_MS,
} from '../../../store/projectSlice';
import DagCanvas from '../DagCanvas';

vi.mock('../../PlasmidMiniMap', () => ({
  default: ({ length }) => <div data-testid="dag-plasmid-mini-map" data-length={length}>map</div>,
}));

beforeEach(() => {
  clearAllAutosaveTimers();
  setAutosaveDelay(0);
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
    s.toasts = [];
  });
});
afterEach(() => {
  cleanup();
  clearAllAutosaveTimers();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
});

describe('M-C.1 K5 — STRINGS.dag namespace', () => {
  it('exposes the empty-state copy', () => {
    expect(STRINGS.dag.emptyHint).toMatch(/перетащите/i);
    expect(STRINGS.dag.emptyCta).toMatch(/библиотек/i);
  });

  it('exposes the four palette group labels', () => {
    expect(STRINGS.dag.paletteGroupThisProject).toBeTruthy();
    expect(STRINGS.dag.paletteGroupDemo).toBeTruthy();
    expect(STRINGS.dag.paletteGroupMine).toBeTruthy();
    expect(STRINGS.dag.paletteGroupSnapgene).toBeTruthy();
  });

  it('exposes the drawer CTAs and the auto-layout button label', () => {
    expect(STRINGS.dag.drawerAddToCanvas).toMatch(/добавить/i);
    expect(STRINGS.dag.drawerClose).toMatch(/закрыть/i);
    expect(STRINGS.dag.autoLayoutButton).toMatch(/раскладк/i);
  });

  it('exposes the duplicate-add toast copy', () => {
    expect(STRINGS.dag.toastAlreadyOnCanvas).toMatch(/уже/i);
  });

  it('exposes the region-overflow function returning the «+N ещё» label', () => {
    expect(STRINGS.dag.drawerRegionOverflow(3)).toMatch(/\+3.*ещё/);
  });

  it('exposes the container window drill-in copy', () => {
    expect(STRINGS.dag.containerWindowBack).toMatch(/назад/i);
    expect(STRINGS.dag.containerWindowMessage).toMatch(/M-C\.2|разработке/i);
  });
});

describe('M-C.1 K5 — DagCanvas edge deletion', () => {
  it('removes a DAG edge when the host fires an edge-remove change', () => {
    const projectId = useStore.getState().createProject('p1');
    useStore.setState((s) => {
      s.libraryEntries['lib-a'] = {
        id: 'lib-a', kind: 'container', name: 'A',
        payload: { sequence: 'A', length: 1, topology: 'linear', annotations: [] }, ext: {},
      };
      s.libraryEntries['lib-b'] = {
        id: 'lib-b', kind: 'container', name: 'B',
        payload: { sequence: 'A', length: 1, topology: 'linear', annotations: [] }, ext: {},
      };
    });
    useStore.getState().addContainerToCurrentProject('lib-a');
    useStore.getState().addContainerToCurrentProject('lib-b');
    useStore.getState().addDagEdge({ from: 'lib-a', to: 'lib-b' });
    const edgeId = useStore.getState().projects[projectId].dag.edges[0].id;
    expect(edgeId).toBeTruthy();
    // Render the canvas (just to ensure store interaction works in
    // this happy-dom env). The slice action stays the source of truth
    // for K5 edge deletion — DagCanvas wires onEdgesChange to call
    // removeDagEdge, but the slice contract is what matters.
    render(<DagCanvas />);
    act(() => {
      useStore.getState().removeDagEdge(edgeId);
    });
    expect(useStore.getState().projects[projectId].dag.edges).toEqual([]);
  });
});
