/**
 * Sprint UX-1 prototype — K1 scaffold tests.
 *
 * Covers: URL gate (isPrototypeURL), Prototype layout with 3 placeholder panels
 * for K2/K3/K4, and fixture coverage over all 16 feature-palette families.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Prototype, { isPrototypeURL } from '../components/Prototype';
import CanvasBlocksView from '../components/Prototype/CanvasBlocksView';
import PlasmidViewerWrapper from '../components/Prototype/PlasmidViewerWrapper';
import { fixture } from '../components/Prototype/fixture';
import { featureColor, FEATURE_COLORS_V2 } from '../feature-palette';

describe('Sprint UX-1 prototype — K1 scaffold', () => {
  it('isPrototypeURL gates on ?ux=prototype', () => {
    expect(isPrototypeURL('?ux=prototype')).toBe(true);
    expect(isPrototypeURL('?ux=prototype&debug=1')).toBe(true);
    expect(isPrototypeURL('?debug=1&ux=prototype')).toBe(true);
    expect(isPrototypeURL('')).toBe(false);
    expect(isPrototypeURL('?foo=bar')).toBe(false);
    expect(isPrototypeURL('?ux=other')).toBe(false);
    expect(isPrototypeURL(undefined)).toBe(false);
  });

  it('<Prototype /> renders .ux-prototype-root with 3 K2/K3/K4 placeholder panels', () => {
    const { container, getByText } = render(<Prototype />);
    expect(container.querySelector('.ux-prototype-root')).toBeTruthy();
    expect(getByText(/Canvas Blocks.*K2/i)).toBeTruthy();
    expect(getByText(/Plasmid viewer.*K3/i)).toBeTruthy();
    expect(getByText(/Annotation editor.*K4/i)).toBeTruthy();
  });

  it('fixture covers all 16 feature-palette families via featureColor (no unused family)', () => {
    const hits = new Set(fixture.annotations.map((a) => featureColor(a.type, a.name)));
    const palette = new Set(Object.values(FEATURE_COLORS_V2));
    for (const c of palette) {
      expect(hits.has(c), `palette color ${c} not represented in fixture`).toBe(true);
    }
    expect(hits.size).toBe(palette.size);
  });

  it('fixture annotations have valid coords within plasmid length and a name', () => {
    expect(fixture.length).toBeGreaterThan(0);
    expect(fixture.sequence).toHaveLength(fixture.length);
    for (const a of fixture.annotations) {
      expect(a.start).toBeGreaterThanOrEqual(0);
      expect(a.end).toBeLessThanOrEqual(fixture.length);
      expect(a.end).toBeGreaterThan(a.start);
      expect(a.name).toBeTruthy();
      expect(a.type).toBeTruthy();
    }
  });
});

describe('Sprint UX-1 prototype — K2 CanvasBlocksView', () => {
  it('renders one block per fixture annotation with palette-sourced background', () => {
    const { container } = render(<CanvasBlocksView />);
    const blocks = container.querySelectorAll('[data-proto-block]');
    expect(blocks.length).toBe(fixture.annotations.length);

    const palette = new Set(Object.values(FEATURE_COLORS_V2));
    const seen = new Set();
    for (const b of blocks) {
      const bg = b.getAttribute('data-block-color');
      expect(palette.has(bg)).toBe(true);
      seen.add(bg);
    }
    // Fixture is designed so ≥10 distinct palette families appear.
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});

describe('Sprint UX-1 prototype — K3 PlasmidViewerWrapper', () => {
  it('circular map renders ≥10 distinct palette-sourced sub-arc fills', () => {
    const { container } = render(<PlasmidViewerWrapper />);
    const palette = new Set(Object.values(FEATURE_COLORS_V2));
    const paths = container.querySelectorAll('svg path[fill]');
    const seen = new Set();
    for (const p of paths) {
      const fill = p.getAttribute('fill');
      if (palette.has(fill)) seen.add(fill);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});
