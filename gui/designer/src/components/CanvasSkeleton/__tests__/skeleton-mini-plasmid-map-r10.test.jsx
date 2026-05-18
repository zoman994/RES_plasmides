/**
 * skeleton-mini-plasmid-map-r10.test.jsx — Live plasmid visualization.
 *
 * R10 (14.05.2026). Verifies:
 *   - Circular container renders SVG with data-shape="circle".
 *   - Linear container renders SVG with data-shape="linear".
 *   - Linearized-from-circular renders "broken-circle" с cut marker.
 *   - Excised fragment renders with dim opacity.
 *   - ContainerBlock проставляет data-linearized / data-excised корректно
 *     основано на container.origin.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniPlasmidMap from '../canvas/MiniPlasmidMap';
import ContainerBlock from '../canvas/ContainerBlock';
import { BLOCK_LINEAR_H } from '../canvas/canvas-layout';

describe('R10-1 — MiniPlasmidMap shapes', () => {
  it('Circular renders data-shape="circle"', () => {
    render(<MiniPlasmidMap length={2686} circular testId="m1" />);
    const svg = screen.getByTestId('m1');
    expect(svg.getAttribute('data-shape')).toBe('circle');
  });

  it('Linear renders data-shape="linear"', () => {
    render(<MiniPlasmidMap length={500} circular={false} testId="m2" />);
    const svg = screen.getByTestId('m2');
    expect(svg.getAttribute('data-shape')).toBe('linear');
  });

  it('Linearized-from-circular renders "broken-circle" + cut marker', () => {
    render(
      <MiniPlasmidMap
        length={2686}
        circular={false}
        linearizedFromCircular={true}
        cutPosition={500}
        testId="m3"
      />,
    );
    const svg = screen.getByTestId('m3');
    expect(svg.getAttribute('data-shape')).toBe('broken-circle');
    expect(screen.getByTestId('cut-marker')).toBeTruthy();
  });

  it('Excised marker reflected in data-excised attr', () => {
    render(<MiniPlasmidMap length={100} circular={false} excised={true} testId="m4" />);
    const svg = screen.getByTestId('m4');
    expect(svg.getAttribute('data-excised')).toBe('true');
  });

  it('Features render as arcs (circular) / blocks (linear)', () => {
    const annotations = [
      { name: 'ori', type: 'rep_origin', start: 0, end: 500 },
      { name: 'AmpR', type: 'marker', start: 1000, end: 2000 },
    ];
    const { container: dom } = render(
      <MiniPlasmidMap length={3000} annotations={annotations} circular testId="m5" />,
    );
    // Two feature paths (besides backbone arc).
    const paths = dom.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThanOrEqual(3); // backbone + 2 features
  });

  it('Empty annotations — only backbone rendered', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={1000} annotations={[]} circular testId="m6" />,
    );
    const paths = dom.querySelectorAll('svg path');
    // Only backbone (1 path) for full circle.
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });
});

// V66 — arc labels on the canvas container rectangle's mini map
// (reuse of the minimap label-selection logic).
describe('V66 — MiniPlasmidMap feature labels', () => {
  const annots = [
    { name: 'ori', type: 'rep_origin', start: 0, end: 500 },
    { name: 'AmpR', type: 'CDS', start: 1000, end: 2000 },
  ];

  it('circular — renders <text> labels for qualifying features', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={3000} annotations={annots} circular testId="lm1" />,
    );
    const labels = dom.querySelectorAll('[data-testid="mini-plasmid-label"]');
    expect(labels.length).toBeGreaterThanOrEqual(2);
    const txt = Array.from(dom.querySelectorAll('text')).map((t) => t.textContent).join(' ');
    expect(txt).toContain('AmpR');
    expect(txt).toContain('ori');
  });

  it('linear — renders <text> labels above the strip', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={3000} annotations={annots} circular={false} testId="lm2" />,
    );
    expect(dom.querySelectorAll('[data-testid="mini-plasmid-label"]').length).toBeGreaterThanOrEqual(2);
  });

  it('sub-threshold features get no label (selection logic reused)', () => {
    const tiny = [{ name: 'x', type: 'misc_feature', start: 0, end: 5 }];
    const { container: dom } = render(
      <MiniPlasmidMap length={10000} annotations={tiny} circular testId="lm3" />,
    );
    expect(dom.querySelectorAll('[data-testid="mini-plasmid-label"]').length).toBe(0);
  });
});

describe('R10-2 — ContainerBlock state-aware visuals', () => {
  it('Circular container — data-kind="circular", svg data-shape="circle"', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'pUC19',
      sequence: 'A'.repeat(2686), topology: { circular: true },
      annotations: [], length: 2686,
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-c1');
    expect(block.getAttribute('data-kind')).toBe('circular');
    const svg = screen.getByTestId('skeleton-block-c1-svg');
    expect(svg.getAttribute('data-shape')).toBe('circle');
  });

  it('Linear container — data-kind="linear", svg data-shape="linear"', () => {
    const c = {
      id: 'c2', kind: 'molecule', name: 'insert',
      sequence: 'A'.repeat(500), topology: { circular: false },
      annotations: [], length: 500,
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-c2');
    expect(block.getAttribute('data-kind')).toBe('linear');
    const svg = screen.getByTestId('skeleton-block-c2-svg');
    expect(svg.getAttribute('data-shape')).toBe('linear');
  });

  it('Linearized from circular (cut linear product) → data-linearized="true", svg broken-circle', () => {
    const c = {
      id: 'c3', kind: 'molecule', name: 'pUC19_lin_EcoRI',
      sequence: 'A'.repeat(2686), topology: { circular: false },
      annotations: [], length: 2686,
      origin: {
        kind: 'op_cut',
        parentWasCircular: true,
        enzymes: ['EcoRI'],
        isExcised: false,
      },
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-c3');
    expect(block.getAttribute('data-linearized')).toBe('true');
    const svg = screen.getByTestId('skeleton-block-c3-svg');
    expect(svg.getAttribute('data-shape')).toBe('broken-circle');
    // Status badge shows linearized icon.
    const status = screen.getByTestId('skeleton-block-c3-status');
    expect(status.textContent).toMatch(/linearized/);
  });

  it('Excised fragment → data-excised="true", svg data-excised="true"', () => {
    const c = {
      id: 'c4', kind: 'molecule', name: 'pUC19_excised',
      sequence: 'A'.repeat(50), topology: { circular: false },
      annotations: [], length: 50,
      origin: {
        kind: 'op_cut',
        parentWasCircular: true,
        enzymes: ['EcoRI', 'BamHI'],
        isExcised: true,
      },
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-c4');
    expect(block.getAttribute('data-excised')).toBe('true');
    const svg = screen.getByTestId('skeleton-block-c4-svg');
    expect(svg.getAttribute('data-excised')).toBe('true');
    const status = screen.getByTestId('skeleton-block-c4-status');
    expect(status.textContent).toMatch(/excised/);
  });

  it('Frozen container — lock badge + dashed ghost overlay в SVG', () => {
    const c = {
      id: 'c5', kind: 'molecule', name: 'parent',
      sequence: 'A'.repeat(2686), topology: { circular: true },
      annotations: [], length: 2686,
      frozen: true,
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    expect(screen.getByTestId('skeleton-block-c5-lock')).toBeTruthy();
    const block = screen.getByTestId('skeleton-block-c5');
    expect(block.getAttribute('data-frozen')).toBe('true');
  });

  it('Origin.enzymes shows в status row right side', () => {
    const c = {
      id: 'c6', kind: 'molecule', name: 'lin',
      sequence: 'A'.repeat(2000), topology: { circular: false },
      annotations: [], length: 2000,
      origin: { kind: 'op_cut', parentWasCircular: true, enzymes: ['EcoRI', 'BamHI'] },
    };
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-c6');
    expect(block.textContent).toMatch(/EcoRI\+BamHI/);
  });
});

// V68 — ContainerBlock proportions + name isolation. The container name
// must NEVER overlap the MiniPlasmidMap V66 leader-labels: the name lives
// in its own divider-separated band, the map wrapper clips its overflow.
describe('V68 — ContainerBlock name-band isolation + proportions', () => {
  const c = {
    id: 'v68', kind: 'molecule', name: 'pUC19-very-long-name-that-could-collide',
    sequence: 'A'.repeat(3000), topology: { circular: true },
    annotations: [
      { name: 'ori', type: 'rep_origin', start: 0, end: 600, level: 'region' },
      { name: 'AmpR', type: 'CDS', start: 1000, end: 2200, level: 'region' },
    ],
    length: 3000,
  };

  it('block is taller (closer to square) — height = BLOCK_LINEAR_H = 150', () => {
    expect(BLOCK_LINEAR_H).toBe(150);
    render(<ContainerBlock container={c} highlighted={false} />);
    const block = screen.getByTestId('skeleton-block-v68');
    expect(block.style.height).toBe('150px');
    expect(block.style.width).toBe('240px');
  });

  it('name lives in its own band (data-testid) separated by a divider', () => {
    render(<ContainerBlock container={c} highlighted={false} />);
    const band = screen.getByTestId('skeleton-block-v68-name');
    expect(band).toBeTruthy();
    expect(band.textContent).toContain('pUC19-very-long-name');
    // A bottom divider visually fences the name off from the map row.
    expect(band.getAttribute('style') || '').toMatch(/border-bottom/);
  });

  it('map row clips overflow so V66 labels can never bleed into the name', () => {
    render(<ContainerBlock container={c} highlighted={false} />);
    const mapRow = screen.getByTestId('skeleton-block-v68-map');
    expect(mapRow.style.overflow).toBe('hidden');
    // V66 labels still render inside the (now clipped) map row.
    const labels = mapRow.querySelectorAll('[data-testid="mini-plasmid-label"]');
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('placeholder block also adopts the taller proportions', () => {
    const ph = { id: 'v68p', kind: 'placeholder' };
    render(<ContainerBlock container={ph} highlighted={false} onPlaceholderClick={() => {}} />);
    const block = screen.getByTestId('skeleton-block-v68p');
    expect(block.style.height).toBe('150px');
  });
});

// V75 — PCR primers + flanked-region overlay on the canvas MiniPlasmidMap
// (shown on the template block when its PCR op is selected).
describe('V75 — MiniPlasmidMap PCR primers + flank overlay', () => {
  const primers = [
    { start: 10, end: 30, direction: 'forward', name: 'fwd' },
    { start: 60, end: 80, direction: 'reverse', name: 'rev' },
  ];
  const flank = { start: 10, end: 80 };

  it('circular — renders flank band + 2 directional primer markers', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={100} circular primers={primers} flank={flank} testId="mpc" />,
    );
    expect(dom.querySelector('[data-testid="mini-plasmid-flank"]')).toBeTruthy();
    const pr = dom.querySelectorAll('[data-testid="mini-plasmid-primer"]');
    expect(pr.length).toBe(2);
    const dirs = Array.from(pr).map((e) => e.getAttribute('data-direction')).sort();
    expect(dirs).toEqual(['forward', 'reverse']);
  });

  it('linear — renders flank band + primer markers', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={100} circular={false} primers={primers} flank={flank} testId="mpl" />,
    );
    expect(dom.querySelector('[data-testid="mini-plasmid-flank"]')).toBeTruthy();
    expect(dom.querySelectorAll('[data-testid="mini-plasmid-primer"]').length).toBe(2);
  });

  it('no primers/flank props → no overlay (back-compat, default off)', () => {
    const { container: dom } = render(
      <MiniPlasmidMap length={100} circular testId="mpn" />,
    );
    expect(dom.querySelector('[data-testid="mini-plasmid-flank"]')).toBeNull();
    expect(dom.querySelectorAll('[data-testid="mini-plasmid-primer"]').length).toBe(0);
  });

  it('ContainerBlock forwards pcrPrimers/pcrFlank to its MiniPlasmidMap', () => {
    const c = {
      id: 'cb1', kind: 'molecule', name: 'tpl',
      sequence: 'A'.repeat(100), topology: { circular: true },
      annotations: [], length: 100,
    };
    const { container: dom } = render(
      <ContainerBlock container={c} highlighted={false} pcrPrimers={primers} pcrFlank={flank} />,
    );
    expect(dom.querySelector('[data-testid="mini-plasmid-flank"]')).toBeTruthy();
    expect(dom.querySelectorAll('[data-testid="mini-plasmid-primer"]').length).toBe(2);
  });
});
