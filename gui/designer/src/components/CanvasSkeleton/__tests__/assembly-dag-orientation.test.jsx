/**
 * VERT-4 — AssemblyDagView gains a horizontal/vertical orientation toggle. The
 * vertical (TB) mode is the «второй вариант DAG» (Игорь 26.06): the chain stacks
 * source→operation→fragment→product top→bottom, fragments showing их липкие концы.
 * Here we assert the toggle wires direction down to ZoneGraphContent.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { SkeletonProvider, useSkeletonActions } from '../store/skeleton-context';
import AssemblyDagView from '../workspace/AssemblyDagView';
import { bootstrapStore } from '../../../store';
import { GRID_ROW_H } from '../canvas/canvas-layout';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
function H() { A = useSkeletonActions(); return null; }

const C = (id, zoneId, name) => ({
  id, kind: 'molecule', name, sequence: 'ATGCATGCATGC', length: 12, topology: { circular: false }, zoneId,
});
const seededState = () => ({
  containers: [C('c1', 'z1', 'Backbone'), C('c2', 'z1', 'Insert')],
  operations: [{
    id: 'op1', kind: 'pcr', inputs: ['c1'], outputs: ['c2'], zoneId: 'z1',
  }],
  pieces: [],
  zones: [{
    id: 'z1', name: 'Assembly', bounds: { x: 0, y: 0, width: 600, height: 400 },
  }],
});

function mount(zoneId, seed) {
  render(
    <SkeletonProvider>
      <H />
      <AssemblyDagView zoneId={zoneId} />
    </SkeletonProvider>,
  );
  if (seed) act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: seed }); });
}

describe('VERT-4 — AssemblyDagView orientation toggle', () => {
  it('renders a horizontal/vertical toggle; default direction is LR', () => {
    mount('z1', seededState());
    expect(screen.getByTestId('assembly-dag-orient-lr')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-orient-tb')).toBeTruthy();
    expect(screen.getByTestId('zone-graph-content').getAttribute('data-direction')).toBe('LR');
  });

  it('clicking «vertical» flips ZoneGraphContent to direction TB; back to LR', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-tb')); });
    expect(screen.getByTestId('zone-graph-content').getAttribute('data-direction')).toBe('TB');
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-lr')); });
    expect(screen.getByTestId('zone-graph-content').getAttribute('data-direction')).toBe('LR');
  });

  // VERT-6 — TB reserves extra HORIZONTAL canvas padding so the fragment cards'
  // protruding sticky-end nucleotides are never clipped (Игорь 27.06 «панель не должна
  // обрезать нуклеотиды»).
  it('TB adds horizontal canvas padding (X-pad > Y-pad) so protruding ends aren’t clipped', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-tb')); });
    const scaled = screen.getByTestId('assembly-dag-scaled');
    expect(parseInt(scaled.style.paddingLeft || '0', 10))
      .toBeGreaterThan(parseInt(scaled.style.paddingTop || '0', 10));
  });
});

// Ф1 (Игорь 27.06) — в TB карточки подвижны строго по сетке; «сбросить раскладку»
// возвращает авто. В LR drag отключён (карточка не двигается).
describe('Ф1 — AssemblyDagView grid drag (TB)', () => {
  const dragNode = (id, dx, dy) => {
    const node = screen.getByTestId(`zone-graph-node-${id}`);
    act(() => {
      fireEvent.pointerDown(node, {
        button: 0, clientX: 0, clientY: 0, pointerId: 1,
      });
      fireEvent.pointerMove(node, { clientX: dx, clientY: dy, pointerId: 1 });
      fireEvent.pointerUp(node, { clientX: dx, clientY: dy, pointerId: 1 });
    });
  };

  it('перетаскивание карточки в TB меняет её позицию (привязка к сетке)', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-tb')); });
    const before = screen.getByTestId('zone-graph-node-c1').style.top;
    // до drag «сбросить раскладку» не показана (overrides пусты)
    expect(screen.queryByTestId('assembly-dag-reset-layout')).toBeNull();

    dragNode('c1', 0, GRID_ROW_H * 2);

    const after = screen.getByTestId('zone-graph-node-c1').style.top;
    expect(after).not.toBe(before);
    expect(screen.getByTestId('assembly-dag-reset-layout')).toBeTruthy();
  });

  it('«сбросить раскладку» возвращает карточку в авто-позицию', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-tb')); });
    const before = screen.getByTestId('zone-graph-node-c1').style.top;
    dragNode('c1', 0, GRID_ROW_H * 2);
    expect(screen.getByTestId('zone-graph-node-c1').style.top).not.toBe(before);

    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-reset-layout')); });
    expect(screen.getByTestId('zone-graph-node-c1').style.top).toBe(before);
    expect(screen.queryByTestId('assembly-dag-reset-layout')).toBeNull();
  });

  it('в LR drag отключён — карточка не двигается', () => {
    mount('z1', seededState());
    // остаёмся в LR (default)
    const before = screen.getByTestId('zone-graph-node-c1').style.left;
    dragNode('c1', GRID_ROW_H * 2, 0);
    expect(screen.getByTestId('zone-graph-node-c1').style.left).toBe(before);
    expect(screen.queryByTestId('assembly-dag-reset-layout')).toBeNull();
  });
});

// Ф3 (Игорь 27.06) — «Объединить в кольцо» = компоновочный жест: выделить ≥2 карточки
// фрагментов → кнопка → выставить кольцевую топологию сборки (SET_ZONE_TOPOLOGY), после
// чего derive САМ рисует операцию замыкания (лигирование) → кольцевой продукт.
// «Компоновка без реакции невозможна» — реакция = существующий узел замыкания.
describe('Ф3 — Объединить в кольцо (TB)', () => {
  it('выбор ≥2 фрагментов → кнопка; клик → SET_ZONE_TOPOLOGY circular', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-orient-tb')); });
    expect(screen.queryByTestId('assembly-dag-ring-btn')).toBeNull();

    act(() => { fireEvent.click(screen.getByTestId('zone-graph-node-c1')); });
    expect(screen.queryByTestId('assembly-dag-ring-btn')).toBeNull(); // 1 выбран — мало

    act(() => { fireEvent.click(screen.getByTestId('zone-graph-node-c2')); });
    expect(screen.getByTestId('assembly-dag-ring-btn')).toBeTruthy(); // 2 выбрано

    const spy = vi.spyOn(A, 'zoneDispatch');
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-ring-btn')); });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_ZONE_TOPOLOGY', zoneId: 'z1', circular: true }),
    );
  });

  it('в LR жеста кольцевания нет (только в вертикали)', () => {
    mount('z1', seededState());
    act(() => { fireEvent.click(screen.getByTestId('zone-graph-node-c1')); });
    act(() => { fireEvent.click(screen.getByTestId('zone-graph-node-c2')); });
    expect(screen.queryByTestId('assembly-dag-ring-btn')).toBeNull();
  });
});
