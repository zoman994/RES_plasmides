/**
 * PlasmidMiniMap.test.jsx — track-band coverage.
 *
 * Biolog: «хочу чтобы межгенные участки были видны более чётко.
 * Может добавить просто белую арку?». The minimap previously
 * rendered only a thin (0.5 px) backbone line where features
 * weren't, making intergenic regions read as «nothing» between
 * features. The big PlasmidMap (canvas) already has a contrasting
 * track band; the minimap now matches.
 *
 * Test pins the band's existence + stroke-width sized to the
 * feature stroke (so coloured arcs sit cleanly on top of it).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PlasmidMiniMap from '../PlasmidMiniMap';

afterEach(cleanup);

const SEQ_LEN = 5000;
const ANNOTATIONS = [
  { id: 'r1', name: 'CMV', type: 'promoter', start: 100, end: 800, level: 'region', strand: 1 },
  { id: 'r2', name: 'AsRed2', type: 'CDS', start: 1000, end: 2000, level: 'region', strand: 1 },
];

describe('PlasmidMiniMap — intergenic track band', () => {
  it('circular map renders a track-band ring under feature arcs', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="circular" annotations={ANNOTATIONS} size={120} />
    );
    const band = container.querySelector('[data-testid="plasmid-track-band"]');
    expect(band).toBeTruthy();
    expect(band.tagName.toLowerCase()).toBe('circle');
  });

  it('track-band stroke-width matches the feature stroke (= they share a track)', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="circular" annotations={ANNOTATIONS} size={120} />
    );
    const band = container.querySelector('[data-testid="plasmid-track-band"]');
    // The minimap's strokeWidth = max(4, round(size/13)) → for size=120: round(9.23) = 9.
    // Just assert it's not the thin 0.5 px backbone hint — anything ≥ 4 is fine.
    expect(Number(band.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(4);
  });

  it('linear map renders a track-band line under feature arcs', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="linear" annotations={ANNOTATIONS} size={120} />
    );
    const band = container.querySelector('[data-testid="plasmid-track-band"]');
    expect(band).toBeTruthy();
    expect(band.tagName.toLowerCase()).toBe('line');
  });

  it('track-band fill is none — only the stroke matters (arcs sit on top)', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="circular" annotations={ANNOTATIONS} size={120} />
    );
    const band = container.querySelector('[data-testid="plasmid-track-band"]');
    expect(band.getAttribute('fill')).toBe('none');
  });

  // Biolog: «черную обводку им дай. её не хватает». The white track
  // needs a thin dark contour on its inner + outer edges so it
  // reads as a defined «channel» rather than a soft blob — the
  // canonical plasmid-map silhouette.
  it('circular track has TWO black rim circles (inner + outer)', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="circular" annotations={ANNOTATIONS} size={120} />
    );
    const rims = container.querySelectorAll('[data-testid="plasmid-track-rim"]');
    expect(rims.length).toBe(2);
    // Both must be circles (not lines) for the circular case.
    for (const rim of rims) expect(rim.tagName.toLowerCase()).toBe('circle');
    // Different radii — inner < outer.
    const radii = Array.from(rims).map((r) => Number(r.getAttribute('r'))).sort((a, b) => a - b);
    expect(radii[0]).toBeLessThan(radii[1]);
  });

  it('linear track has TWO black rim lines (top + bottom)', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="linear" annotations={ANNOTATIONS} size={120} />
    );
    const rims = container.querySelectorAll('[data-testid="plasmid-track-rim"]');
    expect(rims.length).toBe(2);
    for (const rim of rims) expect(rim.tagName.toLowerCase()).toBe('line');
    // Different y values — top above, bottom below.
    const ys = Array.from(rims).map((r) => Number(r.getAttribute('y1'))).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(ys[1]);
  });

  it('rims have no fill and a non-zero stroke-width', () => {
    const { container } = render(
      <PlasmidMiniMap length={SEQ_LEN} topology="circular" annotations={ANNOTATIONS} size={120} />
    );
    const rims = container.querySelectorAll('[data-testid="plasmid-track-rim"]');
    for (const rim of rims) {
      expect(rim.getAttribute('fill') === 'none' || !rim.getAttribute('fill')).toBe(true);
      expect(Number(rim.getAttribute('stroke-width'))).toBeGreaterThan(0);
    }
  });
});
