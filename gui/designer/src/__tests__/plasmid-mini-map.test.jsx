import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';
import { FEATURE_COLORS_V2 } from '../feature-palette';

describe('PlasmidMiniMap', () => {
  it('circular topology with regions → renders one path per region', () => {
    const annotations = [
      { id: 'r1', start: 100, end: 460, level: 'region', type: 'CDS', name: 'lacZα' },
      { id: 'r2', start: 1626, end: 2486, level: 'region', type: 'CDS', name: 'AmpR' },
      { id: 'r3', start: 867, end: 1551, level: 'region', type: 'rep_origin', name: 'pMB1 ori' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2686} topology="circular" annotations={annotations} size={64} />
    );
    const paths = container.querySelectorAll('svg > g > path');
    expect(paths.length).toBe(3);
    // V37 mini-fix: each <g> carries aria-label (replaces <title> which
    // triggered a competing native ~700 ms tooltip).
    const labelled = container.querySelectorAll('svg g[aria-label]');
    expect(labelled.length).toBe(3);
    // SVG root carries aria-label
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-label')).toMatch(/circular/);
  });

  it('empty annotations → one solid linker arc with featureColor("linker")', () => {
    const { container } = render(
      <PlasmidMiniMap length={2686} topology="circular" annotations={[]} size={64} />
    );
    // Empty branch renders a <circle> filled with linker color (extra outline circle is fill="none")
    const circles = container.querySelectorAll('svg circle');
    // circles[0] = outline (stroke FEATURE_STROKE, opacity 0.4); circles[1] = empty linker
    const linkerCircle = [...circles].find(c => c.getAttribute('stroke') === FEATURE_COLORS_V2.linker);
    expect(linkerCircle).toBeTruthy();
    // No <path> arcs since annotations is empty
    expect(container.querySelectorAll('svg > g > path').length).toBe(0);
  });

  it('linear topology → renders horizontal bar (no circle root)', () => {
    const { container } = render(
      <PlasmidMiniMap length={1240} topology="linear" annotations={[]} size={46} />
    );
    // Linear root is a <line>, not a <circle>
    expect(container.querySelector('svg > line')).toBeTruthy();
    // Empty linear → one rect with linker color (no outline circle)
    const linkerRect = [...container.querySelectorAll('svg rect')].find(
      r => r.getAttribute('fill') === FEATURE_COLORS_V2.linker
    );
    expect(linkerRect).toBeTruthy();
  });
});
