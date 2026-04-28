/**
 * Kfix-4 — PlasmidMiniMap leader-line labels + custom tooltip + viewBox.
 *
 * Coverage:
 *   - viewBox padding: r ≤ (size − strokeWidth − 2) / 2 → arc geometry stays
 *     inside the SVG box (no clipping).
 *   - Leader-line labels render at size ≥ 100 (V46 K6: was 180 + circular only)
 *     for regions ≥ 300 bp.
 *   - Custom hover-tooltip appears via React state (instant), not waiting
 *     for native ~700 ms popup. <title> stays in DOM for SR a11y.
 *   - Compact size click opens popover with 180 px version.
 */
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';

const ANNOT_BIG = [
  { id: 'r1', start: 0, end: 1500, level: 'region', type: 'CDS', name: 'AmpR' },              // 1500 bp ≥ 300
  { id: 'r2', start: 1500, end: 1900, level: 'region', type: 'rep_origin', name: 'pUC ori' }, // 400 bp ≥ 300
  { id: 'r3', start: 1900, end: 1920, level: 'region', type: 'misc_feature', name: 'tiny' },  // 20 bp < 300
];

describe('Kfix-4 viewBox padding', () => {
  it('size=64 strokeWidth=5 → r leaves >=2 px room (no clipping)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={[]} size={64} />
    );
    const outline = container.querySelector('svg circle');
    const r = parseFloat(outline.getAttribute('r'));
    // strokeWidth at 64 is round(64/13)=5; expected r = (64-5-2)/2 = 28.5
    expect(r).toBeLessThanOrEqual(28.5 + 0.01);
    // r must keep stroke fully inside viewBox (size=64 → cx=32; r + sw/2 ≤ 32).
    expect(r + 5 / 2).toBeLessThanOrEqual(32);
  });
});

describe('K6 (V46) leader labels (size ≥ 100, overlay mode)', () => {
  it('regions ≥300 bp get leader + text, smaller ones do not (overlay)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={180} mode="overlay" />
    );
    const labels = [...container.querySelectorAll('svg text')];
    const labelTexts = labels.map((t) => t.textContent);
    expect(labelTexts).toContain('AmpR');
    expect(labelTexts).toContain('pUC ori');
    expect(labelTexts).not.toContain('tiny');
  });

  it('size=64 — no leader labels (below new size threshold 100)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} mode="overlay" />
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });
});

describe('Kfix-4 custom hover-tooltip via React state', () => {
  it('mouseMove on arc renders an instant tooltip overlay (no <title> wait)', () => {
    const { container, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    expect(queryByTestId('plasmid-mini-map-tooltip')).toBeNull();
    const firstArcGroup = container.querySelector('svg > g');
    fireEvent.mouseMove(firstArcGroup, { clientX: 30, clientY: 30 });
    const tip = queryByTestId('plasmid-mini-map-tooltip');
    expect(tip).toBeTruthy();
    expect(tip.textContent).toMatch(/AmpR/);
    fireEvent.mouseLeave(firstArcGroup);
    expect(queryByTestId('plasmid-mini-map-tooltip')).toBeNull();
  });

  it('arc <g> wrappers carry aria-label for screen readers (V37 — replaces <title>)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    // V37 mini-fix: <title> elements removed (caused native ~700ms tooltip
    // racing the React tooltip). aria-label on <g> keeps a11y, no native UI.
    expect(container.querySelectorAll('svg title').length).toBe(0);
    const labelled = container.querySelectorAll('svg g[aria-label]');
    expect(labelled.length).toBe(3);
    const labels = [...labelled].map((g) => g.getAttribute('aria-label'));
    expect(labels.some((l) => l.includes('AmpR'))).toBe(true);
  });
});

describe('V38 mini-fix-2 compact hover → popover', () => {
  it('size=64 mouseenter opens popover with 180 px nested mini-map; mouseleave closes after debounce (K5.1)', async () => {
    const { queryByTestId, getAllByTestId, getByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    const wrapper = getByTestId('plasmid-mini-map');
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
    fireEvent.mouseEnter(wrapper);
    expect(queryByTestId('plasmid-mini-map-popover')).toBeTruthy();
    // Two mini-maps now in DOM: the original 64px + the 180px inside popover.
    expect(getAllByTestId('plasmid-mini-map').length).toBeGreaterThanOrEqual(2);
    // K5.1: mouseleave does NOT close immediately (250 ms hover-bridge);
    // close eventually after the timer fires.
    fireEvent.mouseLeave(wrapper);
    await new Promise((res) => setTimeout(res, 320));
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
  });

  it('size=64 click does not open popover (V38: hover-only)', () => {
    const { container, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    fireEvent.click(container.querySelector('svg.mini-map'));
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
  });

  it('size=180 — hover does not spawn nested popover (recursive guard)', () => {
    const { queryByTestId, getByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={180} />
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
  });

  it('popover has no ✕ закрыть button (V38: closes on mouseleave only)', () => {
    const { queryByTestId, getByTestId, container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(queryByTestId('plasmid-mini-map-popover')).toBeTruthy();
    expect(container.textContent).not.toMatch(/закрыть/);
  });
});

describe('V39 mini-fix-2 tooltip background covers full text height', () => {
  it('tooltip element has explicit non-zero leading (overrides parent line-height: 0)', () => {
    const { container, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOT_BIG} size={64} />
    );
    const firstArcGroup = container.querySelector('svg > g');
    fireEvent.mouseMove(firstArcGroup, { clientX: 30, clientY: 30 });
    const tip = queryByTestId('plasmid-mini-map-tooltip');
    expect(tip).toBeTruthy();
    // Outer wrapper sets line-height: 0 (svg layout). The tooltip must
    // override this with explicit leading or its background collapses to a
    // 0-px line box and shows a horizontal stripe through the glyphs.
    expect(tip.className).toMatch(/leading-/);
  });
});
