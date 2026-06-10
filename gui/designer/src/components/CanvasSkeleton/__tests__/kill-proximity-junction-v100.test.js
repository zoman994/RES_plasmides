/**
 * V100 — drop контейнера больше НЕ авто-создаёт proximity-junction.
 *
 * `useCanvasLayoutDrag.onPointerUp` при drop'е контейнера с движением
 * раньше звал computeAutoJunctions → reconcileAutoJunctions (junction
 * status:'auto'). Связывание контейнеров теперь идёт через zones /
 * редактор сборки — proximity-коннект мёртв. Фикс убирает блок;
 * прочая drop-логика (zone hit-detection, setNodePinned, justDragged)
 * остаётся.
 *
 * jsdom не моделирует реальный drag-жест с геометрией, но мы можем
 * прогнать onBlockPointerDown → onPointerMove → onPointerUp через
 * renderHook с мок-actions и проверить, что reconcileAutoJunctions НЕ
 * вызван, а setNodePinned (выживший хвост) — вызван.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasLayoutDrag } from '../canvas/useCanvasLayoutDrag';
import { BLOCK_LINEAR_W } from '../canvas/canvas-layout';

function makeActions() {
  return {
    setPosition: vi.fn(),
    opSetPosition: vi.fn(),
    setAssemblyDraftPosition: vi.fn(),
    setHighlight: vi.fn(),
    clearSelection: vi.fn(),
    toggleSelection: vi.fn(),
    openEditorViewOnly: vi.fn(),
    reconcileAutoJunctions: vi.fn(),
    moveNodeToZone: vi.fn(),
    setZoneLaneLayout: vi.fn(),
    setNodePinned: vi.fn(),
    showToast: vi.fn(),
    opAddInput: vi.fn(),
  };
}

function makeState() {
  const mk = (id) => ({
    id, kind: 'molecule', name: id, sequence: 'ATGC',
    annotations: [], topology: { circular: false },
  });
  return {
    containers: [mk('a'), mk('b')],
    // b sits one block-width + 20px to the right of a (the old
    // proximity threshold) — the case that USED to auto-connect.
    positions: { a: { x: 100, y: 100 }, b: { x: 100 + BLOCK_LINEAR_W + 20, y: 100 } },
    zones: [],
    operations: [],
    selectedContainerIds: [],
  };
}

function evt(over = {}) {
  return {
    button: 0,
    clientX: 150,
    clientY: 150,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    stopPropagation: () => {},
    preventDefault: () => {},
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: BLOCK_LINEAR_W, height: 150 }) },
    ...over,
  };
}

describe('V100 — no proximity-junction on container drop', () => {
  it('drag+drop of a container does NOT call reconcileAutoJunctions', () => {
    const actions = makeActions();
    const state = makeState();
    const containerRef = { current: document.createElement('div') };
    const { result } = renderHook(() => useCanvasLayoutDrag({ state, actions, containerRef, zoom: 1 }));

    act(() => { result.current.onBlockPointerDown(evt(), 'a'); });
    act(() => { result.current.onPointerMove(evt({ clientX: 170, clientY: 150 })); });
    act(() => { result.current.onPointerUp(evt({ clientX: 170, clientY: 150 })); });

    expect(actions.reconcileAutoJunctions).not.toHaveBeenCalled();
    // Surviving drop-tail still runs (pins the deliberately-moved node).
    expect(actions.setNodePinned).toHaveBeenCalledWith('container', 'a', true);
  });
});
