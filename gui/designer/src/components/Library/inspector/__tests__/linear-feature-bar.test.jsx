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

// ─── Sprint M-X.3 follow-up — unified cluster frame ─────────────────
// Biolog: «надо добавить все же единую рамку. в цвет основной фичи».
// When ≥ 2 features overlap, draw a single outline around the
// cluster's bounding box in the «main» (widest) feature's colour
// so the bar reads as ONE grouped entity rather than a smear of
// disjoint rects.
describe('LinearFeatureBar — unified cluster frame', () => {
  it('a single non-overlapping feature does NOT get a cluster frame', () => {
    const a = { id: 'a', name: 'AmpR', type: 'CDS', start: 0, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a]} seqLength={9000} />
    );
    expect(container.querySelectorAll('rect[data-cluster-frame="true"]').length).toBe(0);
  });

  it('two non-overlapping features each stand alone — no cluster frame', () => {
    const a = { id: 'a', name: 'A', type: 'CDS', start: 0,    end: 2000, level: 'region' };
    const b = { id: 'b', name: 'B', type: 'CDS', start: 5000, end: 7000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a, b]} seqLength={9000} />
    );
    expect(container.querySelectorAll('rect[data-cluster-frame="true"]').length).toBe(0);
  });

  it('two overlapping features render exactly ONE cluster frame', () => {
    const big   = { id: 'b', name: 'CDS-big',   type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs',       type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frames = container.querySelectorAll('rect[data-cluster-frame="true"]');
    expect(frames.length).toBe(1);
  });

  it('cluster frame stroke = the widest feature\'s palette colour', () => {
    const big   = { id: 'b', name: 'CDS-big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs',     type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frame = container.querySelector('rect[data-cluster-frame="true"]');
    // Find the widest feature's own rect to read its fill (= palette
    // colour). The frame's stroke must match.
    const bigGroup = Array.from(container.querySelectorAll('g[data-feature-start]'))
      .find((g) => g.getAttribute('data-feature-start') === '1000');
    const bigRect = bigGroup.querySelector('rect');
    expect(frame.getAttribute('stroke')).toBe(bigRect.getAttribute('fill'));
  });

  it('cluster frame x..x+width spans the union of cluster member ranges', () => {
    const a = { id: 'a', name: 'A', type: 'CDS', start: 1000, end: 4000, level: 'region' };
    const b = { id: 'b', name: 'B', type: 'CDS', start: 3000, end: 6000, level: 'region' }; // overlaps a
    const c = { id: 'c', name: 'C', type: 'CDS', start: 5000, end: 7000, level: 'region' }; // overlaps b → same cluster as a, b
    const { container } = render(
      <LinearFeatureBar annotations={[a, b, c]} seqLength={9000} />
    );
    const frames = container.querySelectorAll('rect[data-cluster-frame="true"]');
    expect(frames.length).toBe(1); // a-b-c form one connected cluster
    const f = frames[0];
    const x = Number(f.getAttribute('x'));
    const w = Number(f.getAttribute('width'));
    // Cluster bounds: 1000..7000 of 9000 nt → fractions 0.111..0.778.
    // Bar default width is 800 (from LinearFeatureBar's useLayoutEffect
    // initial value before measurement) — fine for ratio assertions.
    // Use proportional checks rather than exact pixels.
    expect(x).toBeLessThan(w + x); // sanity
    // Frame's right edge >= rect of feature 'c' (which starts at 5000).
    const cGroup = Array.from(container.querySelectorAll('g[data-feature-start]'))
      .find((g) => g.getAttribute('data-feature-start') === '5000');
    const cRect = cGroup.querySelector('rect');
    const cLeft = Number(cRect.getAttribute('x'));
    const cWidth = Number(cRect.getAttribute('width'));
    expect(x).toBeLessThanOrEqual(cLeft);            // frame starts no later than c
    expect(x + w).toBeGreaterThanOrEqual(cLeft + cWidth); // and ends no earlier than c's right
  });

  it('two separate clusters render two separate frames', () => {
    // Cluster 1: a + b overlap.
    const a = { id: 'a', name: 'A', type: 'CDS', start: 0,    end: 2000, level: 'region' };
    const b = { id: 'b', name: 'B', type: 'CDS', start: 1500, end: 3000, level: 'region' };
    // Cluster 2: c + d overlap, far from cluster 1.
    const c = { id: 'c', name: 'C', type: 'CDS', start: 5000, end: 6500, level: 'region' };
    const d = { id: 'd', name: 'D', type: 'CDS', start: 6000, end: 8000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a, b, c, d]} seqLength={9000} />
    );
    expect(container.querySelectorAll('rect[data-cluster-frame="true"]').length).toBe(2);
  });

  it('cluster frame has no fill (just stroke) so feature rects show through', () => {
    const big   = { id: 'b', name: 'big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs', type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frame = container.querySelector('rect[data-cluster-frame="true"]');
    expect(frame.getAttribute('fill')).toBe('none');
  });

  // Biolog: «и вокруг этой общей рамки черную обводку». A second
  // outer outline ring sits just outside the coloured cluster frame
  // so the cluster boundary reads as a hard, theme-aware contour
  // even when the main feature's palette colour is light against
  // the bar surface.
  it('every coloured cluster frame is paired with a black outline ring', () => {
    const big   = { id: 'b', name: 'big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs', type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frames = container.querySelectorAll('rect[data-cluster-frame="true"]');
    const outlines = container.querySelectorAll('rect[data-cluster-outline="true"]');
    expect(frames.length).toBe(1);
    expect(outlines.length).toBe(1);
  });

  it('outline ring sits OUTSIDE the coloured frame (slightly larger box)', () => {
    const big   = { id: 'b', name: 'big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs', type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frame = container.querySelector('rect[data-cluster-frame="true"]');
    const outline = container.querySelector('rect[data-cluster-outline="true"]');
    expect(Number(outline.getAttribute('x'))).toBeLessThan(Number(frame.getAttribute('x')));
    expect(Number(outline.getAttribute('width'))).toBeGreaterThan(Number(frame.getAttribute('width')));
  });

  it('outline ring fill is "none" — it\'s a stroke-only halo', () => {
    const big   = { id: 'b', name: 'big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs', type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const outline = container.querySelector('rect[data-cluster-outline="true"]');
    expect(outline.getAttribute('fill')).toBe('none');
  });

  // Biolog: «обводку общую сделать чуть меньше сейчас толстая».
  // Both the coloured cluster frame and the outer halo got their
  // stroke-widths slimmed down. This guards against a future
  // regression that bumps them back to the heavier values.
  it('cluster frame + outline are slim — strokeWidth bounded', () => {
    const big   = { id: 'b', name: 'big', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const small = { id: 's', name: 'rbs', type: 'RBS', start: 2000, end: 3000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const frame = container.querySelector('rect[data-cluster-frame="true"]');
    const outline = container.querySelector('rect[data-cluster-outline="true"]');
    // Coloured inner frame slimmer than ≤ 1.2 px (was 1.6 px).
    expect(Number(frame.getAttribute('stroke-width'))).toBeLessThanOrEqual(1.2);
    // Outer halo slimmer than ≤ 0.5 px (was 0.6 px).
    expect(Number(outline.getAttribute('stroke-width'))).toBeLessThanOrEqual(0.5);
  });

  it('singleton (no cluster frame) → no outline either', () => {
    const a = { id: 'a', name: 'a', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a]} seqLength={9000} />
    );
    expect(container.querySelectorAll('rect[data-cluster-outline="true"]').length).toBe(0);
  });
});

// ─── Sprint M-X.3 follow-up — cluster children sit INSET inside main ─
// Biolog: «надо еще сделать так чтобы уменьшались внутренние фичи,
// чтобы аккуратно выглядело». Inside a cluster, only the WIDEST
// («main») member renders at full bar height — every other member
// is inset top + bottom so it sits visually nested inside the
// main rect, like child features inside a parent operon.
const BAR_H_TOTAL = 22;

function rectHeight(g) {
  return Number(g.querySelector('rect').getAttribute('height'));
}

describe('LinearFeatureBar — cluster children render inset', () => {
  it('singleton renders at full bar height', () => {
    const a = { id: 'a', name: 'lonely', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a]} seqLength={9000} />
    );
    const g = container.querySelector('g[data-feature-start="1000"]');
    expect(rectHeight(g)).toBe(BAR_H_TOTAL);
  });

  it('two non-overlapping features both render at full height', () => {
    const a = { id: 'a', name: 'A', type: 'CDS', start: 0,    end: 2000, level: 'region' };
    const b = { id: 'b', name: 'B', type: 'CDS', start: 5000, end: 8000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a, b]} seqLength={9000} />
    );
    const ga = container.querySelector('g[data-feature-start="0"]');
    const gb = container.querySelector('g[data-feature-start="5000"]');
    expect(rectHeight(ga)).toBe(BAR_H_TOTAL);
    expect(rectHeight(gb)).toBe(BAR_H_TOTAL);
  });

  it('cluster main (widest) keeps full height; cluster child shrinks', () => {
    const big   = { id: 'b', name: 'lacZα', type: 'CDS', start: 1000, end: 7000, level: 'region' };
    const small = { id: 's', name: 'rbs',   type: 'RBS', start: 3000, end: 4000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const bigG = container.querySelector('g[data-feature-start="1000"]');
    const smallG = container.querySelector('g[data-feature-start="3000"]');
    expect(rectHeight(bigG)).toBe(BAR_H_TOTAL);
    expect(rectHeight(smallG)).toBeLessThan(BAR_H_TOTAL);
  });

  it('cluster child y > 0 — top inset', () => {
    const big   = { id: 'b', name: 'b', type: 'CDS', start: 1000, end: 7000, level: 'region' };
    const small = { id: 's', name: 's', type: 'RBS', start: 3000, end: 4000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const smallRect = container.querySelector('g[data-feature-start="3000"] rect');
    expect(Number(smallRect.getAttribute('y'))).toBeGreaterThan(0);
  });

  it('three nested overlaps: outer full height; middle + inner inset', () => {
    const outer  = { id: 'o', name: 'op', type: 'misc_feature', start: 0,    end: 9000, level: 'region' };
    const middle = { id: 'm', name: 'm',  type: 'CDS',          start: 1500, end: 6000, level: 'region' };
    const inner  = { id: 'i', name: 'i',  type: 'RBS',          start: 3500, end: 3900, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[outer, middle, inner]} seqLength={9000} />
    );
    const outerG  = container.querySelector('g[data-feature-start="0"]');
    const middleG = container.querySelector('g[data-feature-start="1500"]');
    const innerG  = container.querySelector('g[data-feature-start="3500"]');
    expect(rectHeight(outerG)).toBe(BAR_H_TOTAL);
    expect(rectHeight(middleG)).toBeLessThan(BAR_H_TOTAL);
    expect(rectHeight(innerG)).toBeLessThan(BAR_H_TOTAL);
  });

  it('two non-overlapping clusters — each cluster\'s own main is full, children inset', () => {
    // cluster 1: a (big) ⊃ a2 (small)
    const a  = { id: 'a',  name: 'a',  type: 'CDS', start: 0,    end: 4000, level: 'region' };
    const a2 = { id: 'a2', name: 'a2', type: 'RBS', start: 1000, end: 1500, level: 'region' };
    // cluster 2: b (big) ⊃ b2 (small)
    const b  = { id: 'b',  name: 'b',  type: 'CDS', start: 5000, end: 9000, level: 'region' };
    const b2 = { id: 'b2', name: 'b2', type: 'RBS', start: 6000, end: 6500, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a, a2, b, b2]} seqLength={9000} />
    );
    expect(rectHeight(container.querySelector('g[data-feature-start="0"]'))).toBe(BAR_H_TOTAL);
    expect(rectHeight(container.querySelector('g[data-feature-start="1000"]'))).toBeLessThan(BAR_H_TOTAL);
    expect(rectHeight(container.querySelector('g[data-feature-start="5000"]'))).toBe(BAR_H_TOTAL);
    expect(rectHeight(container.querySelector('g[data-feature-start="6000"]'))).toBeLessThan(BAR_H_TOTAL);
  });
});

// ─── Sprint M-X.3 follow-up — cluster main acts as a backdrop ────────
// Biolog: «более прозрачно надо, так как мы не видим блоков за ним.
// и сами блоки чуть увеличить». The cluster main feature now renders
// at REDUCED opacity so it reads as a backdrop / container rather
// than a solid block — children popping over it stay clearly
// visible. Children themselves grew a touch (3 px inset instead of
// 4 px) so they're more legible against the wash backdrop.
describe('LinearFeatureBar — cluster main opacity + child size polish', () => {
  it('cluster main rect has LOWER opacity than its child', () => {
    const big   = { id: 'b', name: 'lacZα', type: 'CDS', start: 1000, end: 7000, level: 'region' };
    const small = { id: 's', name: 'rbs',   type: 'RBS', start: 3000, end: 4000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const bigRect = container.querySelector('g[data-feature-start="1000"] rect');
    const smallRect = container.querySelector('g[data-feature-start="3000"] rect');
    const bigOpacity = Number(bigRect.getAttribute('opacity'));
    const smallOpacity = Number(smallRect.getAttribute('opacity'));
    expect(bigOpacity).toBeLessThan(smallOpacity);
    // Cluster main should be visibly washy — pin it under 0.7.
    expect(bigOpacity).toBeLessThanOrEqual(0.65);
  });

  it('singleton keeps its full-saturation opacity (≥ 0.9 for a region)', () => {
    const a = { id: 'a', name: 'a', type: 'CDS', start: 1000, end: 5000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[a]} seqLength={9000} />
    );
    const rect = container.querySelector('g[data-feature-start="1000"] rect');
    expect(Number(rect.getAttribute('opacity'))).toBeGreaterThanOrEqual(0.9);
  });

  it('cluster child rect height ≥ 16 px (only ~3 px inset on a 22 px bar)', () => {
    const big   = { id: 'b', name: 'b', type: 'CDS', start: 1000, end: 7000, level: 'region' };
    const small = { id: 's', name: 's', type: 'RBS', start: 3000, end: 4000, level: 'region' };
    const { container } = render(
      <LinearFeatureBar annotations={[big, small]} seqLength={9000} />
    );
    const smallG = container.querySelector('g[data-feature-start="3000"]');
    expect(rectHeight(smallG)).toBeGreaterThanOrEqual(16);
  });
});
