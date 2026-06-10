/**
 * V97 — RE-сайт `onSiteClick` срабатывает дважды за один клик.
 *
 * RestrictionTrack вешает `onSiteClick` на ДВА события: `onMouseDown`
 * и `onClick`. Комментарий утверждал, что `preventDefault()` на
 * mousedown гасит последующий click — это неверно, в браузере
 * срабатывают оба → `onSiteClick` дважды за жест. На втором сайте
 * парного выбора это схлопывает выделение.
 *
 * Фикс: per-instance `mouseHandledRef` — mousedown ставит флаг и
 * вызывает; click при выставленном флаге сбрасывает и `return`'ит.
 * Тест-среда (`fireEvent.click` без mousedown) — флаг false → click
 * вызывает как раньше (V88-совместимость).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import RestrictionTrack from '../tracks/RestrictionTrack';

afterEach(cleanup);

const SITES = [
  { enzyme: 'EcoRI', position: 5 },
  { enzyme: 'BamHI', position: 20 },
];

function mount(onSiteClick) {
  return render(
    <RestrictionTrack
      sites={SITES}
      lineStart={0}
      lineLen={50}
      charPx={7.2}
      labelChars={8}
      reOrientation="vertical"
      onSiteClick={onSiteClick}
    />,
  );
}

describe('V97 — RestrictionTrack onSiteClick dedup', () => {
  it('1) real gesture (mousedown → click) fires onSiteClick exactly once', () => {
    const onSiteClick = vi.fn();
    mount(onSiteClick);
    const g = screen.getAllByTestId('sequence-view-re-site')[0];
    // Реальный браузерный жест: mousedown предшествует click.
    fireEvent.mouseDown(g, { button: 0 });
    fireEvent.click(g);
    expect(onSiteClick).toHaveBeenCalledTimes(1);
    expect(onSiteClick.mock.calls[0][0]).toMatchObject({ enzyme: 'EcoRI', position: 5 });
  });

  it('2) bare click (no mousedown — happy-dom fireEvent.click) still fires once (V88 compat)', () => {
    const onSiteClick = vi.fn();
    mount(onSiteClick);
    const g = screen.getAllByTestId('sequence-view-re-site')[0];
    fireEvent.click(g);
    expect(onSiteClick).toHaveBeenCalledTimes(1);
  });

  it('3) two separate gestures on two sites → one call per gesture, correct sites', () => {
    const onSiteClick = vi.fn();
    mount(onSiteClick);
    const [gA, gB] = screen.getAllByTestId('sequence-view-re-site');
    fireEvent.mouseDown(gA, { button: 0 });
    fireEvent.click(gA);
    fireEvent.mouseDown(gB, { button: 0 });
    fireEvent.click(gB);
    expect(onSiteClick).toHaveBeenCalledTimes(2);
    expect(onSiteClick.mock.calls[0][0]).toMatchObject({ enzyme: 'EcoRI' });
    expect(onSiteClick.mock.calls[1][0]).toMatchObject({ enzyme: 'BamHI' });
  });
});
