/**
 * Ф1 (DAG drag) — ZoneGraphContent opt-in перетаскивание карточек по сетке.
 *
 * Дефолт (draggable не передан) — поведение прежнее (регресс ZoneFrame безопасен):
 * нет override, нет drag-эмиссии. С draggable:
 *   - positionOverrides размещает карточку в заданной (привязанной) ячейке;
 *   - перетаскивание узла зовёт onNodeDragEnd(id, snapped) с координатой,
 *     привязанной к сетке (snapToGrid);
 *   - сдвиг карточки подавляет клик-хайлайт, а тык без сдвига — нет.
 */
import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ZoneGraphContent from '../canvas/ZoneGraphContent';
import { GRID_COL_W, GRID_ROW_H, graphContentBBox } from '../canvas/canvas-layout';

afterEach(cleanup);

const stagger = {
  left: {
    end: 'left', type: 'blunt', seq: '', len: 0, protruding: 'none', recessed: 'none', label: 'тупой',
  },
  right: {
    end: 'right', type: '5prime', seq: 'AATT', len: 4, protruding: 'bottom', recessed: 'top', label: "5′ AATT",
  },
};
const frag = {
  id: 'frag1', kind: 'molecule', name: 'вектор', sequence: 'ATGCATGCAT', length: 10,
  topology: { circular: false }, annotations: [], _role: 'fragment', _stagger: stagger,
};

describe('ZoneGraphContent — drag по сетке (Ф1)', () => {
  it('positionOverrides размещает карточку в заданной ячейке', () => {
    render(
      <ZoneGraphContent
        containers={[frag]}
        operations={[]}
        direction="TB"
        draggable
        positionOverrides={{ frag1: { x: 760, y: 412 } }}
      />,
    );
    const wrap = screen.getByTestId('zone-graph-node-frag1');
    expect(wrap.style.left).toBe('760px');
    expect(wrap.style.top).toBe('412px');
  });

  it('перетаскивание узла зовёт onNodeDragEnd с привязанной к сетке позицией', () => {
    const onEnd = vi.fn();
    render(
      <ZoneGraphContent
        containers={[frag]}
        operations={[]}
        direction="TB"
        draggable
        onNodeDragEnd={onEnd}
      />,
    );
    const wrap = screen.getByTestId('zone-graph-node-frag1');
    fireEvent.pointerDown(wrap, {
      button: 0, clientX: 0, clientY: 0, pointerId: 1,
    });
    fireEvent.pointerMove(wrap, { clientX: GRID_COL_W, clientY: GRID_ROW_H, pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: GRID_COL_W, clientY: GRID_ROW_H, pointerId: 1 });

    expect(onEnd).toHaveBeenCalledTimes(1);
    const [id, pos] = onEnd.mock.calls[0];
    expect(id).toBe('frag1');
    // base (один узел) у dagre = (0,0); сдвиг на ровно одну ячейку → col1/row1.
    expect(pos.col).toBe(1);
    expect(pos.row).toBe(1);
    expect(pos.x).toBe(GRID_COL_W);
    expect(pos.y).toBe(GRID_ROW_H);
  });

  it('без draggable перетаскивание ничего не эмитит (дефолт без изменений)', () => {
    const onEnd = vi.fn();
    render(
      <ZoneGraphContent
        containers={[frag]}
        operations={[]}
        direction="TB"
        onNodeDragEnd={onEnd}
      />,
    );
    const wrap = screen.getByTestId('zone-graph-node-frag1');
    fireEvent.pointerDown(wrap, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(wrap, { clientX: 300, clientY: 300 });
    fireEvent.pointerUp(wrap, { clientX: 300, clientY: 300 });
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('сдвиг подавляет клик-хайлайт, а тык без сдвига — нет', () => {
    const onClick = vi.fn();
    render(
      <ZoneGraphContent
        containers={[frag]}
        operations={[]}
        direction="TB"
        draggable
        onContainerClick={onClick}
      />,
    );
    const wrap = screen.getByTestId('zone-graph-node-frag1');

    // тык без движения → клик проходит
    fireEvent.pointerDown(wrap, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(wrap, { clientX: 6, clientY: 6 });
    fireEvent.click(wrap);
    expect(onClick).toHaveBeenCalledTimes(1);

    // сдвиг → клик подавлен
    fireEvent.pointerDown(wrap, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(wrap, { clientX: 300, clientY: 300 });
    fireEvent.pointerUp(wrap, { clientX: 300, clientY: 300 });
    fireEvent.click(wrap);
    expect(onClick).toHaveBeenCalledTimes(1); // не вырос
  });
});

describe('graphContentBBox — учитывает overrides (Ф1)', () => {
  it('сдвинутая карточка расширяет footprint вью', () => {
    const base = graphContentBBox([frag], [], 'TB');
    const over = graphContentBBox([frag], [], 'TB', { frag1: { x: 1000, y: 800 } });
    expect(over.width).toBeGreaterThan(base.width);
    expect(over.height).toBeGreaterThan(base.height);
  });
});

describe('ZoneGraphContent — реакция лигирования при сведении (Ф4.3)', () => {
  const A = { ...frag, id: 'A', name: 'A' };
  const B = { ...frag, id: 'B', name: 'B' };
  const compatible = [{
    fromId: 'A', toId: 'B', verdict: 'compatible', overhang: 'AATT', enzyme: 'EcoRI',
  }];

  it('drop рядом — привязка к сетке (без тугого магнита)', () => {
    const onEnd = vi.fn();
    render(
      <ZoneGraphContent
        containers={[A, B]}
        operations={[]}
        direction="TB"
        draggable
        positionOverrides={{ A: { x: 0, y: 0 }, B: { x: GRID_COL_W * 2, y: 0 } }}
        junctions={compatible}
        onNodeDragEnd={onEnd}
      />,
    );
    const wrap = screen.getByTestId('zone-graph-node-B');
    // тащим B из x=760 (base) на одну клетку влево → grid snap в col 1 (x=GRID_COL_W)
    fireEvent.pointerDown(wrap, {
      button: 0, clientX: 0, clientY: 0, pointerId: 1,
    });
    fireEvent.pointerMove(wrap, { clientX: -GRID_COL_W, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: -GRID_COL_W, clientY: 0, pointerId: 1 });

    expect(onEnd).toHaveBeenCalledTimes(1);
    const [id, pos] = onEnd.mock.calls[0];
    expect(id).toBe('B');
    expect(pos.x).toBe(GRID_COL_W); // привязка к ячейке, не тугой мейт
    expect(pos.y).toBe(0);
  });

  it('сведённые совместимые фрагменты → рождается операция «Лигирование» + продукт', () => {
    render(
      <ZoneGraphContent
        containers={[A, B]}
        operations={[]}
        direction="TB"
        positionOverrides={{ A: { x: 0, y: 0 }, B: { x: GRID_COL_W, y: 0 } }}
        junctions={compatible}
      />,
    );
    expect(screen.getByTestId('dag-ligation-op-A-B')).toBeTruthy();
    expect(screen.getByTestId('dag-ligation-product-A-B')).toBeTruthy();
  });

  it('несовместимые рядом — реакция НЕ рождается', () => {
    render(
      <ZoneGraphContent
        containers={[A, B]}
        operations={[]}
        direction="TB"
        positionOverrides={{ A: { x: 0, y: 0 }, B: { x: GRID_COL_W, y: 0 } }}
        junctions={[{ fromId: 'A', toId: 'B', verdict: 'incompatible' }]}
      />,
    );
    expect(screen.queryByTestId('dag-ligation-op-A-B')).toBeNull();
    expect(screen.queryByTestId('dag-ligation-product-A-B')).toBeNull();
  });

  it('совместимые, но разнесённые — реакция НЕ рождается (не сведены)', () => {
    render(
      <ZoneGraphContent
        containers={[A, B]}
        operations={[]}
        direction="TB"
        positionOverrides={{ A: { x: 0, y: 0 }, B: { x: GRID_COL_W * 3, y: 0 } }}
        junctions={compatible}
      />,
    );
    expect(screen.queryByTestId('dag-ligation-op-A-B')).toBeNull();
  });

  it('Ф3 — selectedIds помечает карточку акцентным кольцом', () => {
    render(
      <ZoneGraphContent
        containers={[A, B]}
        operations={[]}
        direction="TB"
        selectedIds={['A']}
      />,
    );
    expect(screen.getByTestId('zone-graph-node-A').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('zone-graph-node-B').getAttribute('data-selected')).toBeNull();
  });
});
