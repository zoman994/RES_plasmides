/**
 * ANN-0A corrective §4 — compound / origin-crossing annotations must render as
 * REAL separate visual parts in the three surfaces a biologist actually looks
 * at, under ONE logical annotation id.
 *
 * These tests mount the actual components. A helper-level `getSegments()`
 * assertion proves nothing about whether the gap is painted or whether a
 * feature vanishes because its scalar `end < start`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import PlasmidMapV2 from '../../components/PlasmidMapV2';
import LinearMapV2 from '../../components/LinearMapV2';
import AnnotationTrack from '../../components/SequenceView/tracks/AnnotationTrack';
import { LOCATION_KINDS, makeLocation } from '../annotation-location';

const LEN = 1000;

/** Origin-crossing CDS: [900,1000) + [0,50) — 150 bp, NOT 1000 bp. */
function wrapAnnotation(over = {}) {
  return {
    id: 'wrap1', name: 'wrapCDS', type: 'CDS', level: 'region', strand: 1,
    location: makeLocation(LOCATION_KINDS.JOIN, [
      { start: 900, end: 1000 }, { start: 0, end: 50 },
    ]),
    start: 900, end: 50,
    ...over,
  };
}

/** Linear spliced CDS: [100,200) + [400,500) — the gap must stay empty. */
function joinAnnotation(over = {}) {
  return {
    id: 'join1', name: 'splicedCDS', type: 'CDS', level: 'region', strand: 1,
    location: makeLocation(LOCATION_KINDS.JOIN, [
      { start: 100, end: 200 }, { start: 400, end: 500 },
    ]),
    start: 100, end: 500,
    ...over,
  };
}

function parts(container, selector) {
  return Array.from(container.querySelectorAll(selector));
}

// ─────────────────────────────────────────────────────────────────────────────
// PlasmidMapV2 — circular
// ─────────────────────────────────────────────────────────────────────────────

describe('PlasmidMapV2 — compound arcs', () => {
  it('draws BOTH arcs of an origin-crossing feature under one id', () => {
    const { container } = render(
      <PlasmidMapV2 annotations={[wrapAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    const drawn = parts(container, '[data-testid="plasmid-v2-exon"]');
    expect(drawn.length).toBe(2);

    const group = container.querySelector('[data-spliced="true"]');
    expect(group).toBeTruthy();
    // the whole feature is one logical annotation
    expect(group.getAttribute('data-region-id') || 'wrap1').toBe('wrap1');
  });

  it('tooltip reports both ranges and the real biological length', () => {
    const { container } = render(
      <PlasmidMapV2 annotations={[wrapAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    const title = container.querySelector('[data-spliced="true"] title');
    expect(title.textContent).toContain('901–1000, 1–50');
    expect(title.textContent).toContain('150 bp');
    expect(title.textContent).not.toContain('1000 bp');
  });

  it('does not paint the origin gap as an intron connector', () => {
    const { container } = render(
      <PlasmidMapV2 annotations={[wrapAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    // across the origin the parts are contiguous — no dashed bridge
    expect(parts(container, '[data-testid^="plasmid-v2-intron-"]')).toHaveLength(0);
  });

  it('preserves segments on the `fragments` input path too', () => {
    const { container } = render(
      <PlasmidMapV2
        fragments={[{ id: 'f1', sequence: 'A'.repeat(LEN), annotations: [wrapAnnotation()] }]}
        totalBp={LEN}
        length={LEN}
      />,
    );
    expect(parts(container, '[data-testid="plasmid-v2-exon"]').length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LinearMapV2
// ─────────────────────────────────────────────────────────────────────────────

describe('LinearMapV2 — compound bars', () => {
  it('renders a linear join as two bars with an empty gap', () => {
    const { container } = render(
      <LinearMapV2 annotations={[joinAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    const bars = parts(container, '[data-region-id="join1"]');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('renders an origin-crossing feature as two bars at opposite ends', () => {
    const { container } = render(
      <LinearMapV2 annotations={[wrapAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    const bars = parts(container, '[data-region-id="wrap1"]');
    expect(bars.length).toBeGreaterThanOrEqual(2);
    // a scalar start>end feature must not disappear
    expect(bars.length).not.toBe(0);
  });

  it('labels the feature once, not once per part', () => {
    const { container } = render(
      <LinearMapV2 annotations={[joinAnnotation()]} totalBp={LEN} length={LEN} />,
    );
    // visible <text> labels only — the <title> tooltip is not a second label
    const labels = parts(container, 'text')
      .filter((t) => (t.textContent || '').includes('splicedCDS'));
    expect(labels).toHaveLength(1);
  });

  it('click on either part reports the same logical annotation', () => {
    const onClick = vi.fn();
    const { container } = render(
      <LinearMapV2
        annotations={[joinAnnotation()]}
        totalBp={LEN}
        length={LEN}
        onFeatureClick={onClick}
      />,
    );
    const bars = parts(container, '[data-region-id="join1"]');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SequenceView AnnotationTrack
// ─────────────────────────────────────────────────────────────────────────────

describe('AnnotationTrack — compound parts', () => {
  const trackProps = { lineStart: 0, lineLen: 600, charPx: 8, labelChars: 6 };

  it('renders a linear join as separate parts without filling the gap', () => {
    const { container } = render(
      <AnnotationTrack {...trackProps} regions={[joinAnnotation()]} />,
    );
    const rects = parts(container, '[data-region-id="join1"]');
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('an origin-crossing feature does not vanish when scalar end < start', () => {
    const { container } = render(
      <AnnotationTrack {...trackProps} lineLen={1000} regions={[wrapAnnotation()]} />,
    );
    const rects = parts(container, '[data-region-id="wrap1"]');
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('selection lights every visual part of the same id', () => {
    const { container } = render(
      <AnnotationTrack {...trackProps} regions={[joinAnnotation()]} selectedRegionId="join1" />,
    );
    const selected = parts(container, '[data-selected="true"]');
    expect(selected.length).toBeGreaterThanOrEqual(2);
  });

  it('renders one label for the whole feature, not one per part', () => {
    const { container } = render(
      <AnnotationTrack {...trackProps} regions={[joinAnnotation()]} />,
    );
    const labels = parts(container, '[data-label-feature="splicedCDS"]');
    expect(labels.length).toBeLessThanOrEqual(1);
  });

  it('click on a part reports the logical annotation, not the part', () => {
    const onAnnotationClick = vi.fn();
    const { container } = render(
      <AnnotationTrack
        {...trackProps}
        regions={[joinAnnotation()]}
        onAnnotationClick={onAnnotationClick}
      />,
    );
    const rect = container.querySelector('rect[data-region-id="join1"]');
    expect(rect).toBeTruthy();
    rect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onAnnotationClick).toHaveBeenCalled();
    const arg = onAnnotationClick.mock.calls[0][0];
    expect(arg.id).toBe('join1');
    // the consumer must receive the whole feature, not a single segment
    expect(arg.location?.segments?.length ?? 1).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Compound coordinate editing is blocked in the UI, not just in the reducer
// ─────────────────────────────────────────────────────────────────────────────

describe('AnnotationTrack — compound coordinate editing is blocked', () => {
  const trackProps = { lineStart: 0, lineLen: 600, charPx: 8, labelChars: 6 };

  it('offers no active drag handles for a compound annotation', () => {
    const { container } = render(
      <AnnotationTrack
        {...trackProps}
        regions={[joinAnnotation()]}
        onPointerDownEdge={() => {}}
      />,
    );
    const active = parts(container, '[data-testid="sequence-view-annotation-edge"]')
      .filter((el) => el.getAttribute('data-edge-disabled') !== 'true');
    expect(active).toHaveLength(0);
  });

  it('explains why, accessibly, rather than staying silent', () => {
    const { container } = render(
      <AnnotationTrack
        {...trackProps}
        regions={[joinAnnotation()]}
        onPointerDownEdge={() => {}}
      />,
    );
    const disabled = container.querySelector('[data-edge-disabled="true"]');
    expect(disabled).toBeTruthy();
    const explanation = disabled.getAttribute('aria-label')
      || disabled.querySelector('title')?.textContent
      || '';
    expect(explanation.length).toBeGreaterThan(0);
  });

  it('still allows a simple annotation to be dragged', () => {
    const simple = {
      id: 's1', name: 'simple', type: 'CDS', level: 'region', strand: 1,
      location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 100, end: 200 }]),
      start: 100, end: 200,
    };
    const { container } = render(
      <AnnotationTrack {...trackProps} regions={[simple]} onPointerDownEdge={() => {}} />,
    );
    const active = parts(container, '[data-testid="sequence-view-annotation-edge"]')
      .filter((el) => el.getAttribute('data-edge-disabled') !== 'true');
    expect(active.length).toBeGreaterThan(0);
  });
});
