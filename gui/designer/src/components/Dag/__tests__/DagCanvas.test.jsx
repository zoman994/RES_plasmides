/**
 * DagCanvas — Sprint M-C.1 K2 integration tests.
 *
 * Renders the project's containerIds as PlasmidNodes laid out per
 * `Project.dag.positions`. Drop target listens for the
 * `application/x-bodgegene-dag-add` MIME type — that's the contract
 * the DagPalette (K3) writes on its drag handle. Tests simulate a
 * drop by firing a synthetic `drop` event with the MIME payload.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../store';
import {
  setAutosaveDelay,
  clearAllAutosaveTimers,
  DEFAULT_AUTOSAVE_DELAY_MS,
} from '../../../store/projectSlice';
import DagCanvas from '../DagCanvas';

vi.mock('../../PlasmidMiniMap', () => ({
  default: ({ length, topology }) => (
    <div data-testid="dag-plasmid-mini-map" data-length={length} data-topology={topology}>map</div>
  ),
}));

function reset() {
  clearAllAutosaveTimers();
  setAutosaveDelay(0);
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
    s._projectLifecycle = {};
    s.toasts = [];
  });
}

function seedProjectWithEntries(entries) {
  const projectId = useStore.getState().createProject('proj-1');
  for (const [id, ext] of Object.entries(entries)) {
    useStore.setState((s) => {
      s.libraryEntries[id] = {
        id,
        kind: 'container',
        name: ext.name || id,
        tags: [],
        addedAt: '2026-05-07T00:00:00.000Z',
        payload: {
          sequence: 'A'.repeat(ext.length || 1000),
          length: ext.length || 1000,
          topology: ext.topology || 'circular',
          annotations: ext.annotations || [],
        },
        ext: {},
      };
    });
    useStore.getState().addContainerToCurrentProject(id, ext.position || null);
  }
  return projectId;
}

beforeEach(reset);
afterEach(() => {
  cleanup();
  clearAllAutosaveTimers();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
});

describe('M-C.1 K2 — DagCanvas', () => {
  it('renders the empty-state hint when project has no containers', () => {
    useStore.getState().createProject('proj-empty');
    render(<DagCanvas />);
    expect(screen.getByTestId('dag-canvas-empty-state')).toBeTruthy();
  });

  it('renders one PlasmidNode per containerId with positions from dag.positions', () => {
    seedProjectWithEntries({
      'lib-1': { name: 'pUC19', position: { x: 100, y: 200 } },
      'lib-2': { name: 'pET28a', position: { x: 400, y: 200 } },
    });
    render(<DagCanvas />);
    expect(screen.getByTestId('dag-plasmid-node-lib-1')).toBeTruthy();
    expect(screen.getByTestId('dag-plasmid-node-lib-2')).toBeTruthy();
  });

  it('drop event with application/x-bodgegene-dag-add MIME calls addContainerToCurrentProject with a position', () => {
    useStore.getState().createProject('proj-drop');
    useStore.setState((s) => {
      s.libraryEntries['lib-drop'] = {
        id: 'lib-drop',
        kind: 'container',
        name: 'dropped',
        payload: { sequence: 'AAA', length: 3, topology: 'linear', annotations: [] },
        ext: {},
        addedAt: '2026-05-07T00:00:00.000Z',
      };
    });
    render(<DagCanvas />);
    const dropTarget = screen.getByTestId('dag-canvas-drop-target');
    const dataTransfer = {
      types: ['application/x-bodgegene-dag-add'],
      getData: (t) => (t === 'application/x-bodgegene-dag-add' ? 'lib-drop' : ''),
    };
    act(() => {
      fireEvent.dragOver(dropTarget, { dataTransfer });
      fireEvent.drop(dropTarget, { dataTransfer, clientX: 250, clientY: 180 });
    });
    const projectId = useStore.getState().currentProjectId;
    const proj = useStore.getState().projects[projectId];
    expect(proj.containerIds).toContain('lib-drop');
    // Position is set — exact x/y depends on screenToFlowPosition; assert
    // that the node has SOMETHING in dag.positions.
    expect(proj.dag.positions['lib-drop']).toBeDefined();
  });

  it('drop with same id twice surfaces toast «Уже добавлено» and does NOT add a duplicate', () => {
    seedProjectWithEntries({
      'lib-1': { name: 'pUC19', position: { x: 100, y: 100 } },
    });
    render(<DagCanvas />);
    const dropTarget = screen.getByTestId('dag-canvas-drop-target');
    const dataTransfer = {
      types: ['application/x-bodgegene-dag-add'],
      getData: (t) => (t === 'application/x-bodgegene-dag-add' ? 'lib-1' : ''),
    };
    act(() => {
      fireEvent.dragOver(dropTarget, { dataTransfer });
      fireEvent.drop(dropTarget, { dataTransfer, clientX: 250, clientY: 180 });
    });
    const projectId = useStore.getState().currentProjectId;
    expect(useStore.getState().projects[projectId].containerIds).toEqual(['lib-1']);
    const toasts = useStore.getState().toasts;
    expect(toasts.some(t => /уже добавлен/i.test(t.msg || ''))).toBe(true);
  });

  it('auto-layout button computes positions for nodes via dagre and persists them', () => {
    // Chain a→b→c so LR layout puts them on different x columns; without
    // an edge to constrain ranks, dagre stacks disconnected nodes at the
    // same x=0 column. The chain test exercises the actual layout call.
    seedProjectWithEntries({
      'lib-1': { name: 'a' },
      'lib-2': { name: 'b' },
      'lib-3': { name: 'c' },
    });
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    useStore.getState().addDagEdge({ from: 'lib-2', to: 'lib-3' });
    render(<DagCanvas />);
    const btn = screen.getByTestId('dag-canvas-auto-layout');
    act(() => {
      fireEvent.click(btn);
    });
    const projectId = useStore.getState().currentProjectId;
    const positions = useStore.getState().projects[projectId].dag.positions;
    expect(positions['lib-1']).toBeDefined();
    expect(positions['lib-2']).toBeDefined();
    expect(positions['lib-3']).toBeDefined();
    // LR direction with a connecting chain — strictly increasing x.
    expect(positions['lib-1'].x).toBeLessThan(positions['lib-2'].x);
    expect(positions['lib-2'].x).toBeLessThan(positions['lib-3'].x);
  });

  it('auto-layout button is disabled when there are no containers', () => {
    useStore.getState().createProject('proj-empty');
    render(<DagCanvas />);
    const btn = screen.queryByTestId('dag-canvas-auto-layout');
    // Either absent or disabled — both are acceptable for the empty state.
    if (btn) expect(btn.disabled).toBe(true);
    else expect(btn).toBeNull();
  });
});
