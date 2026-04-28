/**
 * Sprint Catalog Polish FIX F1 — `mode='inline' | 'overlay'` contract.
 *
 * Previously V46 (K6) made leader-labels render at any `size >= 100` regardless
 * of context. That broke SingleInspector right column: SVG `overflow: visible`
 * + viewBox 1A expansion let labels stack into Topology / above the modal
 * header on dense annotation sets (SARS-Genome 62 regions, pCAMBIA1381Xb 15).
 *
 * F1 splits the contract:
 *   - `mode='inline'` (default): viewBox stays `0 0 size size`, labels never
 *     render, `overflow: hidden`. Used by every consumer that lives inside
 *     a fixed grid cell (catalog cards, MetaColumn 160 px, MultiInspector rows,
 *     SessionSummary rows).
 *   - `mode='overlay'`: V46 labels rule and 1A viewBox expansion preserved.
 *     Used by F4 hover overlay AND, after FIX-2 (28.04.2026), SingleInspector
 *     right column (Игорь: «правая колонка — большая статичная карта С НАДПИСЯМИ,
 *     без hover-grow»).
 */
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';
import SingleInspector from '../components/ImportStartScreen/SingleInspector';

const ANNOTS = [
  { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'cdsA' },
  { id: 'b', start: 1000, end: 1500, level: 'region', type: 'CDS', name: 'cdsB' },
];

describe('F1 mode=inline (default)', () => {
  it('large plasmid, size 180, default inline → no <text> labels rendered', () => {
    const { container } = render(
      <PlasmidMiniMap length={3000} topology="circular" annotations={ANNOTS} size={180} />,
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });

  it('size=160 SingleInspector inline → no labels, viewBox stays 0 0 160 160', () => {
    const { container } = render(
      <PlasmidMiniMap length={3000} topology="circular" annotations={ANNOTS} size={160} mode="inline" />,
    );
    const svg = container.querySelector('svg.mini-map');
    expect(svg.getAttribute('viewBox')).toBe('0 0 160 160');
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });

  it('inline mode SVG style → overflow: hidden (so it never breaks the grid cell)', () => {
    const { container } = render(
      <PlasmidMiniMap length={3000} topology="circular" annotations={ANNOTS} size={160} mode="inline" />,
    );
    const svg = container.querySelector('svg.mini-map');
    expect(svg.style.overflow).toBe('hidden');
  });

  it('linear inline at any size → still no labels even with ≥300 bp regions', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="linear" annotations={ANNOTS} size={180} mode="inline" />,
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });
});

describe('F1 mode=overlay', () => {
  it('size=180 overlay → labels render (regression V46 K6 contract)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={180} mode="overlay" />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('cdsA');
    expect(labels).toContain('cdsB');
  });

  it('overlay SVG style → overflow: visible (so labels can sit outside viewBox if 1A fires)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={180} mode="overlay" />,
    );
    const svg = container.querySelector('svg.mini-map');
    expect(svg.style.overflow).toBe('visible');
  });
});

describe('F1 name prop is accepted (rendered by F4 overlay)', () => {
  it('inline mode does not render the name (no <text> at all)', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={160} mode="inline" name="pUC19" />,
    );
    expect(container.querySelectorAll('svg text').length).toBe(0);
  });
});

describe('FIX-2 K1 — SingleInspector right column = mode=overlay', () => {
  const baseItem = {
    name: 'pUC19',
    sequence: 'A'.repeat(2686),
    length: 2686,
    topology: 'circular',
    annotations: ANNOTS,
  };
  const baseProps = {
    parsedItem: baseItem,
    topology: 'circular',
    onTopologyChange: () => {},
    originOffset: 1,
    onOriginOffsetChange: () => {},
    onApplyOrigin: () => {},
    originHints: '',
    name: 'pUC19',
    onNameChange: () => {},
    sanitizeReport: null,
    lastActionStatus: null,
    addedItems: [],
    onAction: () => {},
    onReplaceFile: () => {},
    onOpenCanvas: () => {},
    exportEnabled: true,
    hasParsedItem: true,
  };

  it('SingleInspector mini-map renders leader-labels (≥1 <text>) — Игорь: «максимум информации справа»', () => {
    const { container } = render(<SingleInspector {...baseProps} />);
    const texts = container.querySelectorAll('svg.mini-map text');
    // Two ≥300 bp regions in ANNOTS → at least both label texts (and possibly
    // a name <text>; F1 size=160 < the name-render path which uses cy=size+20).
    expect(texts.length).toBeGreaterThanOrEqual(1);
    const labels = [...texts].map((t) => t.textContent);
    expect(labels).toContain('cdsA');
    expect(labels).toContain('cdsB');
  });

  it('SingleInspector mini-map SVG → overflow: visible (overlay mode contract)', () => {
    const { container } = render(<SingleInspector {...baseProps} />);
    const svg = container.querySelector('svg.mini-map');
    expect(svg.style.overflow).toBe('visible');
  });

  it('hover on SingleInspector mini-map does NOT spawn a portal overlay (right column is static)', () => {
    const { container, baseElement } = render(<SingleInspector {...baseProps} />);
    const wrapper = container.querySelector('[data-testid="plasmid-mini-map"]');
    expect(wrapper).toBeTruthy();
    fireEvent.mouseEnter(wrapper);
    // mode='overlay' instances disable the overlayEnabled branch — recursive
    // guard so the right-column tile doesn't grow another overlay on top.
    expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeNull();
  });
});
