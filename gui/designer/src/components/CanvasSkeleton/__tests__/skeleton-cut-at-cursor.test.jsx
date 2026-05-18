/**
 * CUT_CONTAINER_AT_CURSOR — toolbar Cut button logic.
 *
 * 12.05.2026 — Игорь: «разрезать в месте где стоит курсор появляется
 * разрез и на канвасе модифицированный контейнер содержит уже линейный
 * фрагмент линеаризованный по этому месту».
 *
 * Coverage:
 *  - Circular container: rotate sequence + annotations, topology → linear,
 *    name suffix `_cut@<pos>`, origin.kind = 'cut'.
 *  - Linear container: slice [0..cutPos], annotations clipped.
 *  - Wrap-around annotations: split-and-truncate (skeleton MVP).
 *  - Position preserved, id preserved, ends set blunt/blunt.
 *  - Boundary positions (0, length) → no-op (guard).
 *  - Toolbar Cut button disabled когда cursor null / 0 / length.
 *  - Toolbar Cut button enabled при cursor внутри → click dispatches.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import SequenceToolbar from '../editor/SequenceToolbar';

afterEach(cleanup);

const C = (id, opts = {}) => {
  const sequence = opts.sequence !== undefined ? opts.sequence : 'ATGCATGCATGCATGC';
  return {
    id,
    kind: 'molecule',
    name: opts.name || id,
    sequence,
    topology: { circular: opts.circular === undefined ? true : opts.circular },
    length: sequence.length,
    annotations: opts.annotations || [],
    ends: null,
    position: { x: 100, y: 100 },
  };
};

describe('CUT_CONTAINER_AT_CURSOR — circular rotation', () => {
  it('rotates sequence + sets linear topology + annotations shifted', () => {
    const initial = buildInitialState();
    const seq = 'ATGCATGCATGCATGC'; // 16
    const target = C('c-test', {
      sequence: seq,
      circular: true,
      annotations: [
        { id: 'a1', name: 'feat', type: 'CDS', start: 0, end: 4, strand: 1 },
        { id: 'a2', name: 'feat2', type: 'promoter', start: 8, end: 12, strand: 1 },
      ],
    });
    const s = { ...initial, containers: [target] };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-test',
      cutPos: 4,
    });
    const mod = out.containers.find((c) => c.id === 'c-test');
    // Sequence rotated: ATGCATGC...ATGC → starting at index 4.
    expect(mod.sequence).toBe(seq.slice(4) + seq.slice(0, 4));
    expect(mod.length).toBe(16);
    expect(mod.topology).toEqual({ circular: false });
    expect(mod.origin.kind).toBe('cut');
    expect(mod.origin.parentContainerId).toBe('c-test');
    expect(mod.origin.cutPos).toBe(4);
    expect(mod.name).toMatch(/_cut@5/); // 1-based label
    expect(mod.ends.fivePrime.type).toBe('blunt');
    // Annotation a1 (0..4) → wraps around → truncated to (12..16).
    const a1 = mod.annotations.find((a) => a.id === 'a1');
    expect(a1.start).toBe(12);
    expect(a1.end).toBe(16);
    // Annotation a2 (8..12) → shifted to (4..8).
    const a2 = mod.annotations.find((a) => a.id === 'a2');
    expect(a2.start).toBe(4);
    expect(a2.end).toBe(8);
  });

  it('preserves position + id + kind', () => {
    const initial = buildInitialState();
    const target = C('c-test', { sequence: 'AAAATTTT', circular: true });
    const s = {
      ...initial,
      containers: [target],
      positions: { 'c-test': { x: 250, y: 180 } },
    };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-test',
      cutPos: 4,
    });
    expect(out.containers[0].id).toBe('c-test');
    expect(out.positions['c-test']).toEqual({ x: 250, y: 180 });
    expect(out.containers[0].kind).toBe('molecule');
  });

  it('highlights modified container + queues toast', () => {
    const initial = buildInitialState();
    const target = C('c-test', { sequence: 'AAAATTTT', circular: true });
    const s = { ...initial, containers: [target] };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-test',
      cutPos: 4,
    });
    expect(out.highlightedContainerId).toBe('c-test');
    expect(out.toast?.kind).toBe('success');
    expect(out.toast.message).toMatch(/линеаризован/i);
  });
});

describe('CUT_CONTAINER_AT_CURSOR — linear split (12.05.2026 — 2 контейнера)', () => {
  it('linear cut → 2 containers: left in-place + right new, both blunt', () => {
    const initial = buildInitialState();
    const target = C('c-lin', {
      sequence: 'AAAATTTTGGGGCCCC',
      circular: false,
      annotations: [
        { id: 'a1', name: 'kept-left', type: 'CDS', start: 2, end: 6, strand: 1 },
        { id: 'a2', name: 'crosses-cut', type: 'CDS', start: 6, end: 14, strand: 1 },
        { id: 'a3', name: 'right-only', type: 'CDS', start: 10, end: 16, strand: 1 },
      ],
    });
    const s = {
      ...initial,
      containers: [target],
      positions: { 'c-lin': { x: 100, y: 200 } },
    };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-lin',
      cutPos: 8,
    });

    // V61: 2 filled containers + 1 auto-ghost respawn (если cut происходит
    // в state где не было ghost'а — finalizer ensureGhostPlaceholder
    // добавит один).
    const filled = out.containers.filter((c) => c.sequence && c.sequence.length > 0);
    expect(filled.length).toBe(2);

    // Left: kept id, same position, sequence 0..8.
    const left = out.containers.find((c) => c.id === 'c-lin');
    expect(left).toBeTruthy();
    expect(left.sequence).toBe('AAAATTTT');
    expect(left.length).toBe(8);
    expect(left.topology).toEqual({ circular: false });
    expect(left.name).toMatch(/_cut@8_L$/);
    expect(left.origin.cutSide).toBe('left');
    expect(left.ends.fivePrime.type).toBe('blunt');
    expect(left.ends.threePrime.type).toBe('blunt');
    // a1 (2..6) kept; a2 (6..14) clipped to end=8; a3 dropped.
    expect(left.annotations.find((a) => a.id === 'a1')).toMatchObject({ start: 2, end: 6 });
    expect(left.annotations.find((a) => a.id === 'a2')).toMatchObject({ start: 6, end: 8 });
    expect(left.annotations.find((a) => a.id === 'a3')).toBeUndefined();

    // Right: new id, position right of left + gap, sequence 8..16.
    const right = out.containers.find((c) => c.id !== 'c-lin');
    expect(right).toBeTruthy();
    expect(right.sequence).toBe('GGGGCCCC');
    expect(right.length).toBe(8);
    expect(right.topology).toEqual({ circular: false });
    expect(right.name).toMatch(/_cut@8_R$/);
    expect(right.origin.cutSide).toBe('right');
    expect(right.origin.parentContainerId).toBe('c-lin');
    // Position right of left.
    const leftP = out.positions['c-lin'];
    const rightP = out.positions[right.id];
    expect(rightP.x).toBeGreaterThan(leftP.x);
    expect(rightP.y).toBe(leftP.y);
    // Annotations re-coordinated: a2 (6..14) → start = max(0, 6-8) = 0, end = 14-8 = 6.
    expect(right.annotations.find((a) => /^a2/.test(a.id))).toMatchObject({ start: 0, end: 6 });
    // a3 (10..16) → start = 10-8 = 2, end = 16-8 = 8.
    expect(right.annotations.find((a) => /^a3/.test(a.id))).toMatchObject({ start: 2, end: 8 });
    // a1 (2..6) ends before cut → not in right.
    expect(right.annotations.find((a) => /^a1/.test(a.id))).toBeUndefined();
  });

  it('auto-junction kind=ligation создаётся между left+right', () => {
    const initial = buildInitialState();
    const target = C('c-lin', { sequence: 'AAAATTTT', circular: false });
    const s = { ...initial, containers: [target] };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-lin',
      cutPos: 4,
    });
    expect(out.junctions.length).toBe(1);
    const j = out.junctions[0];
    expect(j.kind).toBe('ligation');
    expect(j.fromContainerId).toBe('c-lin');
    // right id is the other container.
    const rightId = out.containers.find((c) => c.id !== 'c-lin').id;
    expect(j.toContainerId).toBe(rightId);
  });

  it('toast уведомляет о 2 фрагментах', () => {
    const initial = buildInitialState();
    const target = C('c-lin', { sequence: 'AAAATTTT', circular: false });
    const s = { ...initial, containers: [target] };
    const out = skeletonReducer(s, {
      type: 'CUT_CONTAINER_AT_CURSOR',
      containerId: 'c-lin',
      cutPos: 4,
    });
    expect(out.toast?.kind).toBe('success');
    expect(out.toast.message).toMatch(/Разделён на 2 фрагмента/);
  });

  it('repeated cut на right-фрагменте — стрипит prev suffix из baseName', () => {
    let s = { ...buildInitialState(), containers: [C('c-lin', { sequence: 'AAAATTTTGGGGCCCC', circular: false })] };
    s = skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'c-lin', cutPos: 8 });
    // V61: filter to filled containers — finalizer добавляет ghost.
    const right = s.containers.find((c) => c.id !== 'c-lin' && c.sequence && c.sequence.length > 0);
    expect(right.name).toMatch(/_cut@8_R$/);
    // Second cut on the right fragment.
    s = skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: right.id, cutPos: 4 });
    const rightLeft = s.containers.find((c) => c.id === right.id);
    const rightRight = s.containers.find((c) =>
      c.id !== 'c-lin' && c.id !== right.id && c.sequence && c.sequence.length > 0);
    expect(rightLeft).toBeTruthy();
    expect(rightRight).toBeTruthy();
    // Base name stripped — no `_cut@8_R_cut@4_L`, just `..._cut@4_L`.
    expect(rightLeft.name).toMatch(/_cut@4_L$/);
    expect(rightLeft.name).not.toMatch(/_cut@8/);
    expect(rightRight.name).toMatch(/_cut@4_R$/);
    // V61: 3 filled (1 left + 1 right-left + 1 right-right) + 1 auto-
    // ghost (finalizer гарантирует 1 placeholder).
    const filled = s.containers.filter((c) => c.sequence && c.sequence.length > 0);
    expect(filled.length).toBe(3);
  });
});

describe('CUT_CONTAINER_AT_CURSOR — guards', () => {
  it('cutPos invalid (NaN / negative / > length) → state unchanged (sans ghost respawn)', () => {
    const initial = buildInitialState();
    const target = C('c-test', { sequence: 'AAAA', circular: true });
    // Include the initial fixture's ghost so finalizer doesn't add another.
    const s = { ...initial, containers: [...initial.containers, target] };
    // V61: identity preservation возможна только если ghost уже есть.
    expect(skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'c-test', cutPos: NaN })).toBe(s);
    expect(skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'c-test', cutPos: -1 })).toBe(s);
    expect(skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'c-test', cutPos: 5 })).toBe(s);
  });

  it('unknown containerId → no-op', () => {
    const initial = buildInitialState();
    const s1 = skeletonReducer(initial, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'nope', cutPos: 2 });
    expect(s1).toBe(initial);
  });

  it('empty sequence → no-op', () => {
    const initial = buildInitialState();
    const target = C('c-empty', { sequence: '', circular: false });
    const s = { ...initial, containers: [target] };
    expect(skeletonReducer(s, { type: 'CUT_CONTAINER_AT_CURSOR', containerId: 'c-empty', cutPos: 0 })).toBe(s);
  });
});

describe('SequenceToolbar — Cut button gating + dispatch', () => {
  it('Cut button enabled when cursor внутри → click invokes onCut', () => {
    const calls = [];
    render(
      <SequenceToolbar
        tab="sequence"
        containerId="c-x"
        cursorPos={5}
        containerLength={100}
        onCut={(id, pos) => calls.push({ id, pos })}
      />,
    );
    const btn = screen.getByTestId('skeleton-editor-tool-cut');
    expect(btn.getAttribute('data-disabled')).toBe('false');
    fireEvent.click(btn);
    expect(calls).toEqual([{ id: 'c-x', pos: 5 }]);
  });

  it('Cut button disabled when cursor null', () => {
    const calls = [];
    render(
      <SequenceToolbar
        tab="sequence"
        containerId="c-x"
        cursorPos={null}
        containerLength={100}
        onCut={(id, pos) => calls.push({ id, pos })}
      />,
    );
    const btn = screen.getByTestId('skeleton-editor-tool-cut');
    expect(btn.getAttribute('data-disabled')).toBe('true');
    fireEvent.click(btn);
    // Cut not dispatched.
    expect(calls).toEqual([]);
  });

  it('Cut button disabled at boundary 0 / length', () => {
    const renderBtn = (cursor) => {
      cleanup();
      render(
        <SequenceToolbar
          tab="sequence"
          containerId="c-x"
          cursorPos={cursor}
          containerLength={100}
          onCut={() => {}}
        />,
      );
      return screen.getByTestId('skeleton-editor-tool-cut');
    };
    expect(renderBtn(0).getAttribute('data-disabled')).toBe('true');
    expect(renderBtn(100).getAttribute('data-disabled')).toBe('true');
    expect(renderBtn(99).getAttribute('data-disabled')).toBe('false');
  });

  it('Cut button disabled when containerId null (placeholder editor)', () => {
    render(
      <SequenceToolbar
        tab="sequence"
        containerId={null}
        cursorPos={50}
        containerLength={100}
        onCut={() => {}}
      />,
    );
    expect(screen.getByTestId('skeleton-editor-tool-cut').getAttribute('data-disabled')).toBe('true');
  });
});
