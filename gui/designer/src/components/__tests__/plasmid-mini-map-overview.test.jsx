/**
 * plasmid-mini-map-overview.test.jsx — SnapGene-style overview extras on
 * PlasmidMiniMap (Игорь 17.06.2026): bp ruler + strand-direction arrows +
 * centre label + click-to-set-origin. All opt-in (off by default → catalog
 * tiles unchanged).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import PlasmidMiniMap from '../PlasmidMiniMap';

afterEach(cleanup);

const ANNS = [
  { id: 'cds1', type: 'CDS', name: 'gene', start: 100, end: 400, level: 'region', strand: 1 },
  { id: 'cds2', type: 'CDS', name: 'rev', start: 600, end: 800, level: 'region', strand: -1 },
];

function renderMap(extra = {}) {
  return render(
    <PlasmidMiniMap
      length={1000} topology="circular" annotations={ANNS}
      size={200} mode="overlay" {...extra}
    />,
  );
}

describe('PlasmidMiniMap — overview extras', () => {
  it('off by default: no ruler/capture/arrows (catalog-tile parity)', () => {
    const { container } = render(
      <PlasmidMiniMap length={1000} topology="circular" annotations={ANNS} size={64} />,
    );
    expect(container.querySelector('[data-testid="plasmid-origin-capture"]')).toBeNull();
    expect(container.querySelectorAll('polygon').length).toBe(0);
  });

  it('showRuler draws major tick labels (bp numbers)', () => {
    const { container } = renderMap({ showRuler: true });
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    // niceTickStep(1000)=100 → labels 100,200,…900 (0 skipped)
    expect(texts).toContain('100');
    expect(texts).toContain('500');
  });

  it('showDirections draws one directional shape per strand ±1 feature', () => {
    const { container } = renderMap({ showDirections: true });
    // Variant A «block arrow» (Игорь 17.06): each directional feature is one
    // integrated shape tagged plasmid-dir-arrow (block <path> when it fits a
    // head, narrow <polygon> when too short). Count by testid, not tag.
    expect(container.querySelectorAll('[data-testid="plasmid-dir-arrow"]').length).toBe(2);
  });

  it('only CDS and promoter features get a strand arrow (ori/misc/primer stay plain bands)', () => {
    const anns = [
      { id: 'cds', type: 'CDS', name: 'gene', start: 100, end: 400, level: 'region', strand: 1 },
      { id: 'prom', type: 'promoter', name: 'P', start: 450, end: 560, level: 'region', strand: 1 },
      { id: 'ori', type: 'rep_origin', name: 'ori', start: 600, end: 800, level: 'region', strand: 1 },
      { id: 'misc', type: 'misc_feature', name: 'x', start: 820, end: 950, level: 'region', strand: -1 },
    ];
    const { container } = render(
      <PlasmidMiniMap length={1000} topology="circular" annotations={anns}
        size={200} mode="overlay" showDirections />,
    );
    // Игорь 17.06: «не у каждого должны быть стрелки — только у промоторов и CDS».
    expect(container.querySelectorAll('[data-testid="plasmid-dir-arrow"]').length).toBe(2);
  });

  it('adaptive head: long feature → block arrow (path), short feature → narrow triangle (polygon)', () => {
    const anns = [
      { id: 'big', type: 'CDS', name: 'big', start: 100, end: 600, level: 'region', strand: 1 },
      { id: 'tiny', type: 'CDS', name: 'tiny', start: 700, end: 712, level: 'region', strand: 1 },
    ];
    const { container } = render(
      <PlasmidMiniMap length={1000} topology="circular" annotations={anns}
        size={200} mode="overlay" showDirections />,
    );
    expect(container.querySelectorAll('[data-testid="plasmid-dir-arrow"]').length).toBe(2);
    expect(container.querySelector('path[data-testid="plasmid-dir-arrow"]')).toBeTruthy(); // block
    expect(container.querySelector('polygon[data-testid="plasmid-dir-arrow"]')).toBeTruthy(); // narrow
  });

  it('centerLabel renders name + bp in the centre', () => {
    const { container } = renderMap({ centerLabel: { name: 'pUC19', bp: 1000 } });
    const g = container.querySelector('[data-testid="plasmid-center-label"]');
    expect(g).toBeTruthy();
    expect(g.textContent).toContain('pUC19');
    expect(g.textContent).toContain('1000 bp');
  });

  it('onPositionClick renders the capture ring; originMarkerBp draws the candidate marker', () => {
    const { container } = renderMap({ onPositionClick: vi.fn(), originMarkerBp: 250 });
    expect(container.querySelector('[data-testid="plasmid-origin-capture"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="plasmid-origin-marker"]')).toBeTruthy();
  });

  it('no candidate marker when originMarkerBp is null or 1', () => {
    const { container } = renderMap({ onPositionClick: vi.fn(), originMarkerBp: null });
    expect(container.querySelector('[data-testid="plasmid-origin-marker"]')).toBeNull();
  });

  it('clicking the capture ring fires onPositionClick with a 1-based bp', () => {
    const onPositionClick = vi.fn();
    const { container } = renderMap({ onPositionClick });
    const svg = container.querySelector('svg');
    // jsdom has no CTM → onRingClick falls back to bounding-rect mapping.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 });
    const capture = container.querySelector('[data-testid="plasmid-origin-capture"]');
    // click east of centre (≈3 o'clock) → ~quarter of 1000
    fireEvent.click(capture, { clientX: 190, clientY: 100 });
    expect(onPositionClick).toHaveBeenCalledTimes(1);
    const bp = onPositionClick.mock.calls[0][0];
    expect(bp).toBeGreaterThanOrEqual(1);
    expect(bp).toBeLessThanOrEqual(1000);
  });

  it('rotationDeg rotates feature geometry but uses NO css transform (text stays upright)', () => {
    const path0 = renderMap({ showRuler: true, showDirections: true, rotationDeg: 0 })
      .container.querySelector('g[aria-label] path').getAttribute('d');
    const { container: c90 } = renderMap({ showRuler: true, showDirections: true, rotationDeg: 90 });
    const path90 = c90.querySelector('g[aria-label] path').getAttribute('d');
    expect(path0).toBeTruthy();
    expect(path90).not.toBe(path0); // geometry rotated, not a wrapper transform
    // No element carries a rotate() transform — a CSS rotate would flip labels.
    expect(c90.querySelector('[transform^="rotate"]')).toBeNull();
  });

  it('the zero notch stays fixed at the top (vertical, centred) regardless of rotation', () => {
    const { container } = renderMap({ showRuler: true, rotationDeg: 120 });
    const top = container.querySelector('[data-testid="plasmid-origin-top"] line');
    expect(top).toBeTruthy();
    expect(top.getAttribute('x1')).toBe(top.getAttribute('x2')); // vertical at centre = top
  });

  it('linear topology: bp ruler + strand arrows render; origin capture stays circular-only', () => {
    const { container } = render(
      <PlasmidMiniMap length={1000} topology="linear" annotations={ANNS} size={200} mode="overlay"
        showRuler showDirections onPositionClick={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="plasmid-ruler-linear"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="plasmid-dir-arrow"]').length).toBe(2); // strand arrows on the linear bar
    expect(container.querySelector('[data-testid="plasmid-origin-capture"]')).toBeNull(); // circular-only
    // ruler labels present (1000 bp, size 200 → ticks @100, labels thinned to @200)
    const texts = Array.from(container.querySelectorAll('[data-testid="plasmid-ruler-linear"] text')).map((t) => t.textContent);
    expect(texts).toContain('200');
  });

  it('linear ruler thins bp LABELS to round multiples so digits do not overlap (marks stay dense)', () => {
    const { container } = render(
      <PlasmidMiniMap length={5486} topology="linear" annotations={ANNS} size={200} mode="overlay" showRuler />,
    );
    const g = container.querySelector('[data-testid="plasmid-ruler-linear"]');
    const labels = Array.from(g.querySelectorAll('text')).map((t) => Number(t.textContent));
    // tickStep=500 → 11 major marks, but on a 200px bar 4-digit labels collide:
    // thinned to every 1000. Round numbers, evenly spaced → no overlap.
    expect(labels).toEqual([1000, 2000, 3000, 4000, 5000]);
    // all the 500-step tick MARKS are still drawn (labels thinned, not the ticks).
    const majorLines = g.querySelectorAll('g > line');
    expect(majorLines.length).toBeGreaterThan(labels.length);
  });
});
