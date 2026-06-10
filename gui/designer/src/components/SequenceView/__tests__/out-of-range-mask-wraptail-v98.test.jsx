/**
 * V98 — OutOfRangeMaskOverlay не затеняет текст на wrap-tail строках.
 *
 * `buildWrapTailLines` даёт wrap-tail строкам РЕАЛЬНЫЕ абсолютные
 * координаты в `data-line-start` (trailing начинается с
 * `cpl − bridge.wrapAt`, не с 0; leading — с `seqLen − leadCnt*cpl`).
 * Ветка `main` overlay'я читает `data-line-start` и маскирует верно;
 * ветки `trailing-wrap` / `leading-wrap` его ИГНОРИРОВАЛИ (хардкод
 * `[0,lineLen)` / `[L−lineLen,L)`) → маска на неверных колонках.
 *
 * Фикс: trailing/leading-wrap считают как main — колонка = `pos −
 * lineStart`. happy-dom не считает offsetLeft (=0), поэтому проверяем
 * `left = (LABEL_WIDTH + colFrom) * charPx`, где colFrom отражает
 * именно `pos − lineStart`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useRef, useEffect, useState } from 'react';
import OutOfRangeMaskOverlay from '../overlays/OutOfRangeMaskOverlay';
import { LABEL_WIDTH } from '../constants.js';

afterEach(cleanup);

const CPL = 80;
const L = 200;
const CHAR_PX = 7;

// Deferred mount so the parent ref is attached before the overlay's
// useLayoutEffect runs (React 19 child-effect / parent-ref ordering).
function Host({ kind, lineStart, rangeStart, rangeEnd }) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        data-testid="sequence-view-line"
        data-wraptail-kind={kind}
        data-line-start={String(lineStart)}
      />
      {mounted ? (
        <OutOfRangeMaskOverlay
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          charPx={CHAR_PX}
          charsPerLine={CPL}
          containerRef={ref}
          seqLength={L}
        />
      ) : null}
    </div>
  );
}

describe('V98 — OOR mask honours data-line-start on wrap-tail rows', () => {
  it('1) trailing-wrap row (data-line-start=120) masks pos−lineStart, not pos', async () => {
    // Line shows [120,200). Range [50,150] → OOR [150,200) intersects
    // → colFrom = 150−120 = 30, colTo = 80. Pre-fix the trailing branch
    // treated pos as column → masked col 0..50 (positions 120..170, mostly
    // IN range) and missed 150..200.
    render(<Host kind="trailing-wrap" lineStart={120} rangeStart={50} rangeEnd={150} />);
    await waitFor(() => {
      const rects = screen.getAllByTestId('sequence-view-oor-mask');
      expect(rects).toHaveLength(1);
      expect(rects[0].style.left).toBe(`${(LABEL_WIDTH + 30) * CHAR_PX}px`); // 266px
      expect(rects[0].style.width).toBe(`${(80 - 30) * CHAR_PX}px`); // 350px
    });
  });

  it('2) leading-wrap row (data-line-start=40) masks pos−lineStart, not pos', async () => {
    // Line shows [40,120). Range [50,150] → OOR [0,50) intersects
    // → colFrom = max(0, 0−40) = 0, colTo = 50−40 = 10.
    render(<Host kind="leading-wrap" lineStart={40} rangeStart={50} rangeEnd={150} />);
    await waitFor(() => {
      const rects = screen.getAllByTestId('sequence-view-oor-mask');
      expect(rects).toHaveLength(1);
      expect(rects[0].style.left).toBe(`${(LABEL_WIDTH + 0) * CHAR_PX}px`); // 56px
      expect(rects[0].style.width).toBe(`${10 * CHAR_PX}px`); // 70px
    });
  });

  it('3) regression — main row (data-line-start=0) unchanged', async () => {
    // Line shows [0,80). Range [50,150] → OOR [0,50) intersects
    // → colFrom 0, colTo 50.
    render(<Host kind="main" lineStart={0} rangeStart={50} rangeEnd={150} />);
    await waitFor(() => {
      const rects = screen.getAllByTestId('sequence-view-oor-mask');
      expect(rects).toHaveLength(1);
      expect(rects[0].style.left).toBe(`${LABEL_WIDTH * CHAR_PX}px`); // 56px
      expect(rects[0].style.width).toBe(`${50 * CHAR_PX}px`); // 350px
    });
  });
});
