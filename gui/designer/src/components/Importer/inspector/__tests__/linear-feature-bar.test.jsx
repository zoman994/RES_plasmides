/**
 * linear-feature-bar.test.jsx — Sprint M-X.3 K5 coverage.
 *
 * The «колбаса» bar at the top of SingleInspector now renders
 * predicted features as ghosts (transparent fill + dashed stroke +
 * tilde-prefixed italic label) — same visual contract as
 * AnnotationTrack inside SequenceView. This test locks the
 * differential rendering between predicted and confirmed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import LinearFeatureBar from '../tabs/LinearFeatureBar';

afterEach(cleanup);

const SEQ_LEN = 5000;

const ANNOTATIONS = [
  // Confirmed — solid fill, no dash.
  { id: 'c1', name: 'AmpR', type: 'CDS',     start: 100,  end: 900,  level: 'region' },
  // Predicted — transparent fill, dashed stroke, italic label.
  {
    id: 'p1', name: 'σ70 promoter', type: 'promoter',
    start: 1200, end: 1230, level: 'region',
    predicted: true, confidence: 0.85, source: 'sigma70_pwm',
  },
  // Auto-detected NOT marked predicted — should still render solid.
  { id: 'a1', name: 'lacZ', type: 'CDS', start: 2000, end: 2900, level: 'region', auto: true },
];

describe('LinearFeatureBar — K5 predicted styling', () => {
  it('marks predicted feature groups with data-feature-predicted="true"', () => {
    const { container } = render(
      <LinearFeatureBar annotations={ANNOTATIONS} seqLength={SEQ_LEN} />
    );
    const groups = container.querySelectorAll('g[data-feature-start]');
    expect(groups.length).toBe(3);
    const predicted = container.querySelectorAll('g[data-feature-predicted="true"]');
    expect(predicted.length).toBe(1);
    // The auto-detected one is NOT predicted (no `predicted: true`
    // flag) — bar must keep it solid.
    const nonPredicted = Array.from(groups).filter(
      (g) => !g.getAttribute('data-feature-predicted')
    );
    expect(nonPredicted.length).toBe(2);
  });

  it('predicted rect has transparent fill + dashed stroke', () => {
    const { container } = render(
      <LinearFeatureBar annotations={ANNOTATIONS} seqLength={SEQ_LEN} />
    );
    const predGroup = container.querySelector('g[data-feature-predicted="true"]');
    expect(predGroup).toBeTruthy();
    const rect = predGroup.querySelector('rect');
    expect(rect.getAttribute('fill')).toBe('transparent');
    expect(rect.getAttribute('stroke-dasharray')).toBe('3,2');
    // Stroke width is bumped on ghosts so the dashed outline reads
    // visibly against the surrounding canvas.
    expect(Number(rect.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(1);
  });

  it('confirmed rect has solid fill (no stroke-dasharray)', () => {
    const { container } = render(
      <LinearFeatureBar annotations={ANNOTATIONS} seqLength={SEQ_LEN} />
    );
    const confirmedGroups = Array.from(
      container.querySelectorAll('g[data-feature-start]')
    ).filter((g) => g.getAttribute('data-feature-predicted') !== 'true');
    expect(confirmedGroups.length).toBeGreaterThan(0);
    for (const g of confirmedGroups) {
      const rect = g.querySelector('rect');
      // Confirmed fill is a real colour, not 'transparent'.
      expect(rect.getAttribute('fill')).not.toBe('transparent');
      // Ghost dasharray must NOT be applied to confirmed.
      expect(rect.getAttribute('stroke-dasharray')).toBeNull();
    }
  });

  it('predicted label is italic + tilde-prefixed', () => {
    // Use long predictions so the label fits inside the rect (the
    // bar suppresses inside-labels for narrow features).
    const longPredicted = [
      {
        id: 'p1', name: 'σ70 promoter', type: 'promoter',
        start: 100, end: 4900, level: 'region',
        predicted: true, confidence: 0.85,
      },
    ];
    const { container } = render(
      <LinearFeatureBar annotations={longPredicted} seqLength={SEQ_LEN} />
    );
    const predGroup = container.querySelector('g[data-feature-predicted="true"]');
    const text = predGroup.querySelector('text');
    expect(text).toBeTruthy();
    expect(text.getAttribute('font-style')).toBe('italic');
    expect(text.textContent.startsWith('~')).toBe(true);
  });

  it('hover title for predicted feature is also tilde-prefixed', () => {
    const { container } = render(
      <LinearFeatureBar annotations={ANNOTATIONS} seqLength={SEQ_LEN} />
    );
    const predGroup = container.querySelector('g[data-feature-predicted="true"]');
    const title = predGroup.querySelector('title');
    expect(title).toBeTruthy();
    expect(title.textContent.startsWith('~')).toBe(true);
  });
});

// ─── Sprint M-X.3 follow-up — only «main» feature label per overlap ──
// Biolog: «когда много фичей накладываются друг на друга получается
// в колбасе каша. Можно выводить только название основной фичи
// поверх?» — when N features overlap, only the WIDEST among them
// (= the «main» one) shows its label; smaller features inside it
// stay silent so the bar reads cleanly.
describe('LinearFeatureBar — overlap label dedup', () => {
  it('a small feature fully covered by a larger one does NOT render a label', () => {
    // Big AmpR covers the whole bar; small RBS sits inside it.
    const big = { id: 'big', name: 'AmpR-long-name', type: 'CDS', start: 0,    end: 9000, level: 'region' };
    const small = { id: 'sm', name: 'RBS',         type: 'RBS', start: 4000, end: 4500, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    // Pick the small group by data-feature-start so we don't depend
    // on render order.
    const groups = Array.from(container.querySelectorAll('g[data-feature-start]'));
    const smallGroup = groups.find((g) => g.getAttribute('data-feature-start') === '4000');
    const bigGroup = groups.find((g) => g.getAttribute('data-feature-start') === '0');
    expect(smallGroup).toBeTruthy();
    expect(bigGroup).toBeTruthy();
    // The big feature DOES render its label — it's the «main» one.
    expect(bigGroup.querySelector('text')).toBeTruthy();
    // The small feature DOES NOT — fully inside a wider one.
    expect(smallGroup.querySelector('text')).toBeNull();
  });

  it('a feature with an exposed (uncovered) segment wide enough still renders its label', () => {
    // Big CDS at 0..3000 — does NOT cover the whole bar. RBS at
    // 4000..7000 sits OUTSIDE big — it's «main» in its own area
    // and must keep its label.
    const big = { id: 'b', name: 'CDS-big', type: 'CDS', start: 0,    end: 3000, level: 'region' };
    const other = { id: 'o', name: 'OtherWide', type: 'CDS', start: 4000, end: 7000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, other]} seqLength={9000} />
    );
    const otherGroup = Array.from(container.querySelectorAll('g[data-feature-start]'))
      .find((g) => g.getAttribute('data-feature-start') === '4000');
    expect(otherGroup.querySelector('text')).toBeTruthy();
  });

  it('with three nested overlaps, only the outermost (widest) renders a label', () => {
    const outer  = { id: 'o', name: 'Operon-Outer',  type: 'misc_feature', start: 0,    end: 9000, level: 'region' };
    const middle = { id: 'm', name: 'CDS-middle',    type: 'CDS',          start: 1500, end: 6000, level: 'region' };
    const inner  = { id: 'i', name: 'rbs',           type: 'RBS',          start: 3500, end: 3900, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[outer, middle, inner]} seqLength={9000} />
    );
    const groups = Array.from(container.querySelectorAll('g[data-feature-start]'));
    const outerG  = groups.find((g) => g.getAttribute('data-feature-start') === '0');
    const middleG = groups.find((g) => g.getAttribute('data-feature-start') === '1500');
    const innerG  = groups.find((g) => g.getAttribute('data-feature-start') === '3500');
    expect(outerG.querySelector('text')).toBeTruthy();
    expect(middleG.querySelector('text')).toBeNull();
    expect(innerG.querySelector('text')).toBeNull();
  });

  it('two same-width siblings each render their own label (no carve, no false dedup)', () => {
    const a = { id: 'a', name: 'PartA', type: 'CDS', start: 0,    end: 3000, level: 'region' };
    const b = { id: 'b', name: 'PartB', type: 'CDS', start: 5000, end: 8000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a, b]} seqLength={9000} />
    );
    const groups = Array.from(container.querySelectorAll('g[data-feature-start]'));
    expect(groups.find((g) => g.getAttribute('data-feature-start') === '0').querySelector('text')).toBeTruthy();
    expect(groups.find((g) => g.getAttribute('data-feature-start') === '5000').querySelector('text')).toBeTruthy();
  });

  it('label is centered in the EXPOSED region — not the whole feature width', () => {
    // Wide promoter from 0..9000 with two big siblings carving it
    // on the left (0..3000) and right (6000..9000). The promoter's
    // exposed strip is 3000..6000; its label should sit at x≈mid of
    // 3000..6000 → ≈x=750 in 1500 px width.
    // (Intent — we just assert label x is inside the exposed pixels,
    // not the geometric centre of the whole rect.)
    const long  = { id: 'l', name: 'Promoter-long', type: 'promoter', start: 0,    end: 9000, level: 'region' };
    const left  = { id: 'L', name: 'Lefty',         type: 'CDS',      start: 0,    end: 3000, level: 'region' };
    const right = { id: 'R', name: 'Righty',        type: 'CDS',      start: 6000, end: 9000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[long, left, right]} seqLength={9000} />
    );
    // Geometry: same-width siblings carve nothing (only LARGER
    // features carve). Here `long` is strictly wider (full bar),
    // so left + right are smaller and DON'T carve. `long` keeps
    // its centred label.
    const longG = Array.from(container.querySelectorAll('g[data-feature-start]'))
      .find((g) => g.getAttribute('data-feature-start') === '0' && g.querySelector('rect[width]'));
    expect(longG.querySelector('text')).toBeTruthy();
  });
});
