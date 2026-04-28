/**
 * Sprint Catalog Polish K6 (V46) — Smart leader-labels refactor.
 *
 * Rules (closed by Игорь 28.04.2026):
 *   - Every region with `(end - start) ≥ 300 bp` AND `type !== 'source'`
 *     gets a leader-label. No category-bias, no upper cap, no global cap.
 *   - showLabels: `size >= 100` for both circular AND linear topologies
 *     (was `size >= 180 && isCircular`).
 *   - viewBox post-render expansion: SVG bbox can overflow the initial
 *     0,0,size,size box; viewBox + width/height widen with 4 px padding.
 *     jsdom (Vitest) has no `getBBox` → effect no-ops, default viewBox kept.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';

describe('V46 region length boundary (300 bp)', () => {
  it('region length 300 bp gets a label; 299 bp does not', () => {
    const annots = [
      { id: 'a', start: 0, end: 300, level: 'region', type: 'CDS', name: 'just_300' },
      { id: 'b', start: 400, end: 699, level: 'region', type: 'CDS', name: 'just_299' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('just_300');
    expect(labels).not.toContain('just_299');
  });
});

describe('V46 type=source blacklist', () => {
  it('region with type=source is excluded regardless of length (covers full plasmid)', () => {
    const annots = [
      { id: 's', start: 0, end: 14000, level: 'region', type: 'source', name: 'Escherichia coli' },
      { id: 'a', start: 100, end: 600, level: 'region', type: 'CDS', name: 'lacZ' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={14000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).not.toContain('Escherichia coli');
    expect(labels).toContain('lacZ');
  });
});

describe('V46 linear topology gets labels (size ≥ 100)', () => {
  it('linear plasmid with size=180 renders leader-labels for ≥300 bp regions', () => {
    const annots = [
      { id: 'a', start: 100, end: 800, level: 'region', type: 'CDS', name: 'cdsA' },
      { id: 'b', start: 1000, end: 1400, level: 'region', type: 'CDS', name: 'cdsB' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="linear" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('cdsA');
    expect(labels).toContain('cdsB');
  });
});

describe('V46 size threshold (showLabels at size ≥ 100)', () => {
  it('size=100 renders labels (new threshold)', () => {
    const annots = [
      { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'big' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={100} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('big');
  });

  it('size=99 does NOT render labels', () => {
    const annots = [
      { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'big' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={99} />,
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });
});

describe('V46 no upper cap (heavy plasmid)', () => {
  it('15 regions ≥300 bp all get labels (no MAX_LABELS=8 cap)', () => {
    const annots = Array.from({ length: 15 }, (_, i) => ({
      id: `r${i}`,
      start: i * 1000,
      end: i * 1000 + 400, // 400 bp each → all pass 300 bp threshold
      level: 'region',
      type: 'CDS',
      name: `cds${i}`,
    }));
    const { container } = render(
      <PlasmidMiniMap length={20000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels.length).toBe(15);
    for (let i = 0; i < 15; i++) {
      expect(labels).toContain(`cds${i}`);
    }
  });
});

describe('V46 viewBox post-render expansion (jsdom fallback)', () => {
  it('default viewBox stays 0,0,size,size when getBBox is unavailable (jsdom)', () => {
    // jsdom does not implement getBBox; the useLayoutEffect catches the throw
    // and leaves viewBox at its initial value. This test verifies the effect
    // does not crash in the test environment and the fallback is sane.
    const annots = [
      { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'cdsA' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={180} />,
    );
    const svg = container.querySelector('svg.mini-map');
    expect(svg).toBeTruthy();
    // Default viewBox: "0 0 180 180" (no expansion under jsdom).
    expect(svg.getAttribute('viewBox')).toBe('0 0 180 180');
    expect(svg.getAttribute('width')).toBe('180');
    expect(svg.getAttribute('height')).toBe('180');
    // overflow:visible means even if expansion did happen, SVG content
    // wouldn't be clipped. Keep that contract here.
    expect(svg.style.overflow).toBe('visible');
  });
});
