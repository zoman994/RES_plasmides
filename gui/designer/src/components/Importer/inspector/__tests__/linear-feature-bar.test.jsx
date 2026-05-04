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
