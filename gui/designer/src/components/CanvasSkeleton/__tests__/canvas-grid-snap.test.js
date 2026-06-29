/**
 * Ф1 (DAG drag) — snapToGrid: подвижные карточки вертикального DAG двигаются
 * СТРОГО ПО СЕТКЕ (Игорь 27.06: «перемещение строго по сетке, перескок чтобы
 * можно было на уровень ниже... чтобы их можно было на одном уровне ставить.
 * Совсем свободное перемещение не нужно»).
 *
 * Сетка = ранги (строки = уровни получения фрагмента) × дорожки (колонки = ветви
 * сборки). snapToGrid привязывает произвольную позицию к ближайшей ячейке; шаг
 * сетки совпадает с шагом раскладки dagre в TB (BLOCK_LINEAR_W + nodesep по X,
 * BLOCK_LINEAR_H + ranksep по Y), поэтому защёлкнутые карточки не перекрывают
 * выходящие из них липкие концы.
 */
import { describe, it, expect } from 'vitest';
import {
  snapToGrid,
  magnetSnap,
  JUNCTION_MATE_GAP,
  GRID_COL_W,
  GRID_ROW_H,
  BLOCK_LINEAR_W,
  BLOCK_LINEAR_H,
} from '../canvas/canvas-layout';

describe('snapToGrid — сетка подвижных карточек DAG', () => {
  it('шаг сетки не меньше карточки (защёлкнутые ячейки не накладываются)', () => {
    expect(GRID_COL_W).toBeGreaterThanOrEqual(BLOCK_LINEAR_W);
    expect(GRID_ROW_H).toBeGreaterThanOrEqual(BLOCK_LINEAR_H);
  });

  it('почти-нулевая позиция → ячейка (0,0)', () => {
    expect(snapToGrid({ x: 5, y: 3 })).toEqual({
      x: 0, y: 0, col: 0, row: 0,
    });
  });

  it('привязка к ближайшей ячейке (col 1, row 1)', () => {
    const r = snapToGrid({ x: GRID_COL_W + 20, y: GRID_ROW_H - 10 });
    expect(r).toEqual({
      x: GRID_COL_W, y: GRID_ROW_H, col: 1, row: 1,
    });
  });

  it('округление вниз, если ближе к нижней ячейке', () => {
    const r = snapToGrid({ x: GRID_COL_W * 0.3, y: GRID_ROW_H * 0.3 });
    expect(r.col).toBe(0);
    expect(r.row).toBe(0);
  });

  it('округление вверх, если ближе к следующей ячейке', () => {
    const r = snapToGrid({ x: GRID_COL_W * 0.7, y: GRID_ROW_H * 0.7 });
    expect(r.col).toBe(1);
    expect(r.row).toBe(1);
  });

  it('«перескок на уровень ниже»: row 2 → row 0 при подъёме к чужой строке', () => {
    const low = snapToGrid({ x: 0, y: GRID_ROW_H * 2 + 5 });
    expect(low.row).toBe(2);
    const lifted = snapToGrid({ x: 0, y: 8 });
    expect(lifted.row).toBe(0);
  });

  it('отрицательные координаты зажимаются в ячейку 0 (канвас начинается с 0,0)', () => {
    const r = snapToGrid({ x: -120, y: -300 });
    expect(r).toEqual({
      x: 0, y: 0, col: 0, row: 0,
    });
  });

  it('кастомный шаг и origin через opts', () => {
    const r = snapToGrid(
      { x: 250, y: 250 },
      {
        colW: 100, rowH: 100, originX: 50, originY: 50,
      },
    );
    // (250-50)/100 = 2 → col 2 → x = 50 + 2*100 = 250
    expect(r).toEqual({
      x: 250, y: 250, col: 2, row: 2,
    });
  });

  it('устойчив к пустому аргументу', () => {
    expect(snapToGrid()).toEqual({
      x: 0, y: 0, col: 0, row: 0,
    });
  });
});

describe('magnetSnap — притяжение к стыку (Ф2)', () => {
  const W = BLOCK_LINEAR_W;

  it('совместимый сосед на нужной стороне → мейт-позиция (концы смыкаются)', () => {
    const placements = { A: { x: 0, y: 0 } };
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'compatible' }];
    // B брошен в клетку справа от A, та же строка → притягивается к правому концу A.
    const grid = snapToGrid({ x: GRID_COL_W, y: 0 });
    const r = magnetSnap('B', grid, placements, junctions);
    expect(r).toBeTruthy();
    expect(r.x).toBe(W + JUNCTION_MATE_GAP);
    expect(r.y).toBe(0);
    expect(r.mate).toMatchObject({ partnerId: 'A', side: 'left' });
  });

  it('несовместимый стык НЕ притягивает (Игорь: только совместимые концы)', () => {
    const placements = { A: { x: 0, y: 0 } };
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'incompatible' }];
    const grid = snapToGrid({ x: GRID_COL_W, y: 0 });
    expect(magnetSnap('B', grid, placements, junctions)).toBeNull();
  });

  it('брошен далеко (через клетку) — не притягивает', () => {
    const placements = { A: { x: 0, y: 0 } };
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'compatible' }];
    const grid = snapToGrid({ x: GRID_COL_W * 3, y: 0 });
    expect(magnetSnap('B', grid, placements, junctions)).toBeNull();
  });

  it('брошен на другой ранг (другая строка) — не притягивает', () => {
    const placements = { A: { x: 0, y: 0 } };
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'compatible' }];
    const grid = snapToGrid({ x: GRID_COL_W, y: GRID_ROW_H * 2 });
    expect(magnetSnap('B', grid, placements, junctions)).toBeNull();
  });

  it('перетаскиваемый = fromId → мейтит слева от партнёра', () => {
    const placements = { B: { x: GRID_COL_W, y: 0 } };
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'compatible' }];
    const grid = snapToGrid({ x: 0, y: 0 });
    const r = magnetSnap('A', grid, placements, junctions);
    expect(r).toBeTruthy();
    expect(r.x).toBe(GRID_COL_W - W - JUNCTION_MATE_GAP);
    expect(r.mate).toMatchObject({ partnerId: 'B', side: 'right' });
  });

  it('партнёра нет в раскладке — не притягивает', () => {
    const junctions = [{ fromId: 'A', toId: 'B', verdict: 'compatible' }];
    const grid = snapToGrid({ x: GRID_COL_W, y: 0 });
    expect(magnetSnap('B', grid, {}, junctions)).toBeNull();
  });
});
