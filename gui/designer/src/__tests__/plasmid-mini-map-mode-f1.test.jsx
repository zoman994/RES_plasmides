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
 *     SessionSummary rows). After FIX-2 follow-up (28.04.2026) SingleInspector
 *     also lives here — labels + name pushed the SVG past the 200 px column.
 *   - `mode='overlay'`: V46 labels rule and 1A viewBox expansion preserved.
 *     Used by F4 hover overlay only.
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

describe('FIX-2 follow-up — SingleInspector mini-map (full-width row, overlay-mode, static)', () => {
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
    onOpenCanvas: () => {},
    exportEnabled: true,
    hasParsedItem: true,
  };

  it('mini-map sits in a full-width row above the FileSummaryCard / MetaColumn grid', () => {
    const { getByTestId, container } = render(<SingleInspector {...baseProps} />);
    const row = getByTestId('single-mini-map-row');
    expect(row).toBeTruthy();
    // The row contains a PlasmidMiniMap wrapper.
    expect(row.querySelector('[data-testid="plasmid-mini-map"]')).toBeTruthy();
    // The row is NOT a child of the grid (which lives elsewhere in the body).
    const grid = container.querySelector('.grid');
    expect(grid?.contains(row)).toBe(false);
  });

  it('SingleInspector mini-map renders leader-labels (Игорь: «подписи арок должны быть видны»)', () => {
    const { container } = render(<SingleInspector {...baseProps} />);
    const labels = [...container.querySelectorAll('svg.mini-map text')].map((t) => t.textContent);
    expect(labels).toContain('cdsA');
    expect(labels).toContain('cdsB');
  });

  it('SingleInspector mini-map does NOT render the plasmid name <text> (FIX-2 follow-up)', () => {
    const { container } = render(<SingleInspector {...baseProps} />);
    expect(container.querySelector('[data-testid="plasmid-mini-map-overlay-name"]')).toBeNull();
  });

  it('hover on SingleInspector mini-map does NOT spawn a portal overlay (disableHoverOverlay)', () => {
    const { container, baseElement } = render(<SingleInspector {...baseProps} />);
    const wrapper = container.querySelector('[data-testid="plasmid-mini-map"]');
    expect(wrapper).toBeTruthy();
    fireEvent.mouseEnter(wrapper);
    expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeNull();
  });
});

describe('FIX-2 follow-up — disableHoverOverlay prop suppresses the F4 grow-overlay', () => {
  it('inline tile WITHOUT disableHoverOverlay → hover spawns overlay', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeTruthy();
  });

  it('inline tile WITH disableHoverOverlay → hover does NOT spawn overlay', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} disableHoverOverlay />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeNull();
  });
});
