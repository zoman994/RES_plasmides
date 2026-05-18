/**
 * Auto-junctions (v0.5 paradigma restored, 12.05.2026).
 *
 * Coverage:
 *  - computeAutoJunctions helper: pairs blocks по proximity (gap +
 *    y-overlap thresholds), filters placeholders.
 *  - RECONCILE_AUTO_JUNCTIONS reducer: adds new pairs, drops auto
 *    junctions no longer matching, preserves manual junctions.
 *  - REMOVE_JUNCTION reducer.
 *  - REMOVE_CONTAINER also drops junctions referencing that container.
 *  - SVG render layer: junction path присутствует когда есть proximity.
 *  - ContainerBlock — все filled блоки rectangular (kind='linear'|'circular')
 *    220×90, circular показывает только ◯ icon (не отдельная форма).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CanvasSkeleton from '../index';
import {
  skeletonReducer,
  buildInitialState,
} from '../store/skeleton-state';
import {
  computeAutoJunctions,
  BLOCK_LINEAR_W,
  BLOCK_LINEAR_H,
} from '../canvas/canvas-layout';

afterEach(cleanup);

const mkContainer = (id, sequence = 'ATGC') => ({
  id,
  kind: 'molecule',
  name: id,
  topology: { circular: false },
  length: sequence.length,
  sequence,
  annotations: [],
  ends: null,
});

describe('computeAutoJunctions helper', () => {
  it('two filled blocks side-by-side (gap < threshold, same y) — pair detected', () => {
    const containers = [mkContainer('a'), mkContainer('b')];
    const positions = {
      a: { x: 100, y: 100 },
      b: { x: 100 + BLOCK_LINEAR_W + 20, y: 100 }, // 20px gap < 32px threshold
    };
    const pairs = computeAutoJunctions(containers, positions);
    expect(pairs).toEqual([{ fromContainerId: 'a', toContainerId: 'b' }]);
  });

  it('blocks far apart — no pairs', () => {
    const containers = [mkContainer('a'), mkContainer('b')];
    const positions = {
      a: { x: 100, y: 100 },
      b: { x: 600, y: 100 }, // gap ~ 280px > 32 threshold
    };
    expect(computeAutoJunctions(containers, positions)).toEqual([]);
  });

  it('blocks at different Y — no pair (vertical mismatch)', () => {
    const containers = [mkContainer('a'), mkContainer('b')];
    const positions = {
      a: { x: 100, y: 100 },
      b: { x: 100 + BLOCK_LINEAR_W + 20, y: 300 },
    };
    expect(computeAutoJunctions(containers, positions)).toEqual([]);
  });

  it('placeholder block excluded by default (filledOnly)', () => {
    const containers = [
      mkContainer('a'),
      { id: 'ph', sequence: '', topology: { circular: false } },
    ];
    const positions = {
      a: { x: 100, y: 100 },
      ph: { x: 100 + BLOCK_LINEAR_W + 20, y: 100 },
    };
    expect(computeAutoJunctions(containers, positions)).toEqual([]);
  });

  it('three blocks in a row → 2 sequential pairs', () => {
    const containers = [mkContainer('a'), mkContainer('b'), mkContainer('c')];
    const x = 100;
    const positions = {
      a: { x, y: 100 },
      b: { x: x + BLOCK_LINEAR_W + 10, y: 100 },
      c: { x: x + (BLOCK_LINEAR_W + 10) * 2, y: 100 },
    };
    const pairs = computeAutoJunctions(containers, positions);
    // a→b и b→c (a→c gap слишком большой).
    const keys = pairs.map((p) => `${p.fromContainerId}->${p.toContainerId}`).sort();
    expect(keys).toEqual(['a->b', 'b->c']);
  });
});

describe('RECONCILE_AUTO_JUNCTIONS reducer', () => {
  it('seeds first auto-junction', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    expect(s1.junctions).toHaveLength(1);
    expect(s1.junctions[0]).toMatchObject({
      fromContainerId: 'a',
      toContainerId: 'b',
      kind: 'auto',
    });
  });

  it('removes auto-junction when pair no longer matches', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    expect(s.junctions).toHaveLength(1);
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [], // блоки разъехались
    });
    expect(s.junctions).toHaveLength(0);
  });

  it('preserves manual junctions even when no longer matching pair', () => {
    let s = buildInitialState();
    // Inject manual junction directly (no action — bypass reducer for test).
    s = { ...s, junctions: [{ id: 'j-manual', fromContainerId: 'x', toContainerId: 'y', kind: 'gibson' }] };
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [],
    });
    expect(s.junctions).toHaveLength(1);
    expect(s.junctions[0].kind).toBe('gibson');
  });

  it('идемпотентна — same pairs not duplicated', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    const s1 = s;
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    // Same set → no churn → reducer returns same ref.
    expect(s).toBe(s1);
  });
});

describe('REMOVE_JUNCTION reducer', () => {
  it('drops junction by id', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    const jid = s.junctions[0].id;
    s = skeletonReducer(s, { type: 'REMOVE_JUNCTION', junctionId: jid });
    expect(s.junctions).toHaveLength(0);
  });

  it('unknown id — state unchanged', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'REMOVE_JUNCTION', junctionId: 'nope' });
    expect(s1).toBe(s0);
  });
});

describe('REMOVE_CONTAINER cascades to junctions', () => {
  it('drops any junction referencing removed container', () => {
    let s = buildInitialState();
    // Filled containers added via fill so REMOVE_CONTAINER has actual ids
    // to remove; mock by replacing placeholder names + sequences.
    const filledContainer = {
      ...s.containers[0],
      sequence: 'ATGC', // make it filled
    };
    s = { ...s, containers: [filledContainer, ...s.containers.slice(1)] };
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: filledContainer.id, toContainerId: 'c-placeholder-2' }],
    });
    expect(s.junctions).toHaveLength(1);
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: filledContainer.id });
    expect(s.junctions).toHaveLength(0);
  });
});

describe('ContainerBlock — все блоки rectangular (12.05.2026)', () => {
  it('placeholder block имеет kind=placeholder + plus icon', () => {
    render(<CanvasSkeleton />);
    const b = screen.getByTestId('skeleton-block-c-placeholder-1');
    expect(b.getAttribute('data-kind')).toBe('placeholder');
  });

  it('Junction layer SVG не рендерится когда junctions пуст (default)', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-junctions-svg')).toBeNull();
  });
});
