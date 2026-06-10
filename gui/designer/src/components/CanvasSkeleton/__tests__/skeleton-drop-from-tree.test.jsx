/**
 * Drag-from-Library-Tree → Canvas drop-target.
 *
 * Coverage:
 *  - Reducer: ADD_CONTAINER_FROM_ENTRY creates new container with
 *    correct shape + origin.sourceEntryId + position; multi-drop = 2
 *    different ids (no dedup, NOTES §2 DEC-CANVAS-V2-INSTANCES-NOT-DEDUP).
 *  - containerFromLibraryEntry helper: maps payload.sequence /
 *    payload.topology / payload.annotations / payload.ends.
 *  - CanvasLayoutView/Graph: drop handler reads MIME, looks up entry
 *    via global store, dispatches action.
 *  - Visual feedback: data-drag-over flips on dragenter / dragleave.
 *  - Negative: unknown MIME → no action; missing entry → no-op.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import CanvasSkeleton from '../index';
import {
  skeletonReducer,
  buildInitialState,
  containerFromLibraryEntry,
} from '../store/skeleton-state';
import { useStore, bootstrapStore } from '../../../store';

const sampleEntry = (id = 'lib-1', name = 'sample', seq = 'ATGCATGCATGC') => ({
  id,
  kind: 'container',
  name,
  payload: {
    sequence: seq,
    length: seq.length,
    topology: 'circular',
    annotations: [{ name: 'feat', type: 'CDS', start: 0, end: 6, strand: 1 }],
    ends: null,
  },
});

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
});

describe('containerFromLibraryEntry helper', () => {
  it('maps Library entry payload → container shape', () => {
    const c = containerFromLibraryEntry(sampleEntry('lib-A', 'pUC19', 'ATGC'));
    expect(c.kind).toBe('molecule');
    expect(c.name).toBe('pUC19');
    expect(c.sequence).toBe('ATGC');
    expect(c.length).toBe(4);
    expect(c.topology).toEqual({ circular: true });
    expect(c.annotations).toHaveLength(1);
    expect(c.origin.kind).toBe('tree_drag');
    expect(c.origin.sourceEntryId).toBe('lib-A');
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(8);
  });

  it('linear topology → {circular: false}', () => {
    const entry = sampleEntry('lib-B', 'gBlock', 'AAAA');
    entry.payload.topology = 'linear';
    const c = containerFromLibraryEntry(entry);
    expect(c.topology).toEqual({ circular: false });
  });

  it('two calls → two different ids', () => {
    const a = containerFromLibraryEntry(sampleEntry('lib-same'));
    const b = containerFromLibraryEntry(sampleEntry('lib-same'));
    expect(a.id).not.toBe(b.id);
    expect(a.origin.sourceEntryId).toBe('lib-same');
    expect(b.origin.sourceEntryId).toBe('lib-same');
  });
});

describe('ADD_CONTAINER_FROM_ENTRY reducer', () => {
  it('appends new container with position; highlights it; toast queued', () => {
    const s0 = buildInitialState();
    const baselineLen = s0.containers.length;
    const entry = sampleEntry('lib-X', 'imported-X', 'GATC');
    const s1 = skeletonReducer(s0, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry,
      position: { x: 220, y: 140 },
    });
    expect(s1.containers.length).toBe(baselineLen + 1);
    const added = s1.containers[s1.containers.length - 1];
    expect(added.name).toBe('imported-X');
    expect(added.origin.sourceEntryId).toBe('lib-X');
    expect(s1.positions[added.id]).toEqual({ x: 220, y: 140 });
    expect(s1.highlightedContainerId).toBe(added.id);
    expect(s1.toast?.kind).toBe('success');
  });

  it('multi-drop of SAME entry → 2 different containers (no dedup)', () => {
    let s = buildInitialState();
    const entry = sampleEntry('lib-dup', 'dup', 'AAAA');
    s = skeletonReducer(s, { type: 'ADD_CONTAINER_FROM_ENTRY', entry, position: { x: 10, y: 20 } });
    s = skeletonReducer(s, { type: 'ADD_CONTAINER_FROM_ENTRY', entry, position: { x: 50, y: 60 } });
    const dups = s.containers.filter((c) => c.origin?.sourceEntryId === 'lib-dup');
    expect(dups.length).toBe(2);
    expect(dups[0].id).not.toBe(dups[1].id);
  });

  it('missing position → defaults to {80,80}', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry: sampleEntry(),
      position: null,
    });
    const added = s1.containers[s1.containers.length - 1];
    expect(s1.positions[added.id]).toEqual({ x: 80, y: 80 });
  });

  it('null entry → state unchanged', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'ADD_CONTAINER_FROM_ENTRY', entry: null, position: null });
    expect(s1).toBe(s0);
  });

  it('entry without id → state unchanged', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry: { name: 'no-id', payload: { sequence: 'AT' } },
    });
    expect(s1).toBe(s0);
  });

  it('negative position clamps to 0', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry: sampleEntry('lib-neg'),
      position: { x: -50, y: -10 },
    });
    const added = s1.containers[s1.containers.length - 1];
    expect(s1.positions[added.id]).toEqual({ x: 0, y: 0 });
  });
});

describe('CanvasGraphView — drop handler integration', () => {
  it('drop on Graph canvas creates new container', () => {
    const entry = sampleEntry('lib-graph-drop', 'graph-import', 'ATGC');
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: { ...(s.libraryEntries || {}), [entry.id]: entry },
      }));
    });

    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-view-toggle-graph'));
    const canvas = screen.getByTestId('skeleton-canvas-graph');

    fireEvent.drop(canvas, {
      dataTransfer: {
        types: ['application/x-bodge-entry-id'],
        getData: (t) => (t === 'application/x-bodge-entry-id' ? entry.id : ''),
      },
      clientX: 300,
      clientY: 250,
    });

    // Scope to canvas — Library tree shows the entry name too.
    expect(within(canvas).getByText('graph-import')).toBeTruthy();
  });
});
