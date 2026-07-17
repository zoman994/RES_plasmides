import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { bootstrapStore, useStore } from '../../store';
import PlasmidMapV2 from '../PlasmidMapV2';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(cleanup);

const ANNS = [
  { id: 'a', level: 'region', type: 'promoter', name: 'PglaA', start: 250, end: 950, strand: 1 },
  { id: 'b', level: 'region', type: 'CDS', name: 'XynTL', start: 971, end: 1990, strand: 1 },
  { id: 'c', level: 'region', type: 'resistance', name: 'AmpR', start: 3250, end: 4060, strand: -1 },
];
const FRAGS = [{ id: 'p', name: 'pTest', type: 'plasmid', length: 5000, sequence: 'ATGC'.repeat(1250), annotations: ANNS }];

describe('PlasmidMapV2 — feature-centric circular map', () => {
  it('renders one arrow + one external label per region feature', () => {
    render(<PlasmidMapV2 fragments={FRAGS} constructName="pTest" totalBp={5000} />);
    expect(screen.getByTestId('plasmid-map-v2')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-feature-0')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-feature-2')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-label-0')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-label-2')).toBeTruthy();
  });

  it('shows the construct name + bp · topology in the centre', () => {
    const { container } = render(<PlasmidMapV2 fragments={FRAGS} constructName="pTest" totalBp={5000} />);
    expect(container.textContent).toContain('pTest');
    expect(container.textContent).toMatch(/5[\s,]?000 bp · circular/);
  });

  it('clicking a feature calls onSelectFragment with its index', () => {
    const onSel = vi.fn();
    render(<PlasmidMapV2 fragments={FRAGS} constructName="pTest" totalBp={5000} onSelectFragment={onSel} />);
    fireEvent.click(screen.getByTestId('plasmid-v2-feature-1'));
    expect(onSel).toHaveBeenCalledWith(1);
  });

  it('clicking a feature calls onSelectRegion with the region id (toggle)', () => {
    const onReg = vi.fn();
    render(<PlasmidMapV2 fragments={FRAGS} constructName="pTest" totalBp={5000} onSelectRegion={onReg} selectedRegionId={null} />);
    fireEvent.click(screen.getByTestId('plasmid-v2-label-0'));
    expect(onReg).toHaveBeenCalledWith('a');
  });

  it('a hovered feature renders the tooltip with type + strand', () => {
    const { container } = render(<PlasmidMapV2 fragments={FRAGS} constructName="pTest" totalBp={5000} />);
    fireEvent.mouseEnter(screen.getByTestId('plasmid-v2-feature-0'));
    const tip = screen.getByTestId('plasmid-v2-tooltip');
    expect(tip.textContent).toContain('PglaA');
    expect(tip.textContent).toMatch(/forward/);
  });
});

// UX-1 / V-FEAT-3 (circular half) — introns already render as exon-split gaps;
// this adds the MISSING layers: non-intron sub-features (domains/tags) as nested
// arcs + points (mutations/RE) as markers, so a gene's internal structure is
// visible on the circular overview.
describe('PlasmidMapV2 — sub-features + points (UX-1)', () => {
  // intron carries `parentId` → it exon-splits the gene (and is excluded from the
  // detail-arc layer to avoid double-draw); domain (regionId) is a nested arc.
  const ANN2 = [
    { id: 'g1', level: 'region', type: 'CDS', name: 'glaA', start: 0, end: 1200, strand: 1 },
    { id: 'i1', level: 'detail', type: 'intron', name: 'intron 1', parentId: 'g1', start: 300, end: 360, strand: 1 },
    { id: 'd2', level: 'detail', type: 'domain', name: 'catalytic', regionId: 'g1', start: 700, end: 1100, strand: 1 },
    { id: 'm1', level: 'point', type: 'mutation', name: 'C96S', regionId: 'g1', start: 960, end: 961 },
  ];
  const renderAnn = (props = {}) => render(
    <PlasmidMapV2 annotations={ANN2} length={1200} totalBp={1200} constructName="glaA" {...props} />,
  );

  it('renders a non-intron sub-feature (domain) as a nested arc', () => {
    renderAnn();
    expect(screen.getByTestId('plasmid-v2-detail-0')).toBeTruthy();
  });

  it('renders point annotations (mutation) as markers', () => {
    renderAnn();
    expect(screen.getByTestId('plasmid-v2-point-0')).toBeTruthy();
  });

  it('a parentId intron exon-splits the gene and is NOT duplicated as a detail arc', () => {
    renderAnn();
    expect(screen.getByTestId('plasmid-v2-feature-0').getAttribute('data-spliced')).toBe('true');
    expect(screen.queryByTestId('plasmid-v2-detail-1')).toBeNull(); // only the domain
  });

  it('a regionId-linked intron exon-splits the gene (V182 — regionId is the model standard)', () => {
    const ANN3 = [
      { id: 'g1', level: 'region', type: 'CDS', name: 'glaA', start: 0, end: 1200, strand: 1 },
      { id: 'i1', level: 'detail', type: 'intron', name: 'intron 1', regionId: 'g1', start: 300, end: 360, strand: 1 },
    ];
    render(<PlasmidMapV2 annotations={ANN3} length={1200} totalBp={1200} />);
    // V182: introns link to their gene via regionId (annotate-genes emits regionId,
    // not parentId) → they MUST exon-split like parentId introns, not draw as a
    // duplicate detail arc.
    expect(screen.getByTestId('plasmid-v2-feature-0').getAttribute('data-spliced')).toBe('true');
    expect(screen.queryByTestId('plasmid-v2-detail-0')).toBeNull();
  });

  it('clicking a sub-feature selects it (onSelectRegion with its id)', () => {
    const onReg = vi.fn();
    renderAnn({ onSelectRegion: onReg });
    fireEvent.click(screen.getByTestId('plasmid-v2-detail-0'));
    expect(onReg).toHaveBeenCalledWith('d2');
  });
});

describe('PlasmidMapV2 — fragment (incomplete) features (UX-4)', () => {
  // A complete CDS + an incomplete one (the project _part_ convention) + a partial domain.
  const ANN_FRAG = [
    { id: 'whole', level: 'region', type: 'CDS', name: 'AmpR', start: 0, end: 600, strand: 1 },
    { id: 'frag', level: 'region', type: 'CDS', name: 'KanR_part_1-300', start: 700, end: 1000, strand: 1 },
    { id: 'pdom', level: 'detail', type: 'domain', name: 'helix', regionId: 'whole', coverage: 0.4, start: 100, end: 250, strand: 1 },
  ];

  it('an incomplete (_part_) feature renders pLannotate-style: white fill + coloured outline', () => {
    const { container } = render(<PlasmidMapV2 annotations={ANN_FRAG} length={1200} totalBp={1200} />);
    const frag = container.querySelector('[data-testid^="plasmid-v2-feature-"][data-fragment="true"]');
    expect(frag).toBeTruthy();
    expect(frag.getAttribute('fill')).toMatch(/surface/); // white/paper, not the gene colour
    expect(frag.getAttribute('stroke')).not.toBe('#ffffff'); // outline carries the colour
  });

  it('a complete feature keeps a solid (coloured) fill, no data-fragment', () => {
    const { container } = render(<PlasmidMapV2 annotations={ANN_FRAG} length={1200} totalBp={1200} />);
    const whole = [...container.querySelectorAll('[data-testid^="plasmid-v2-feature-"]')]
      .find((n) => n.getAttribute('data-fragment') !== 'true');
    expect(whole).toBeTruthy();
    expect(whole.getAttribute('fill')).not.toMatch(/surface/);
  });

  it('a low-coverage sub-feature (detail) is drawn as a fragment too', () => {
    const { container } = render(<PlasmidMapV2 annotations={ANN_FRAG} length={1200} totalBp={1200} />);
    const det = container.querySelector('[data-testid^="plasmid-v2-detail-"][data-fragment="true"]');
    expect(det).toBeTruthy();
    expect(det.getAttribute('fill')).toMatch(/surface/);
  });
});

describe('PlasmidMapV2 — RE sites from sequence (fragments mode)', () => {
  // One EcoRI site (GAATTC) at position 20 in a 60 bp fragment.
  const RE_SEQ = 'A'.repeat(20) + 'GAATTC' + 'A'.repeat(34);
  const RE_FRAG = [{ id: 'p', name: 'pRE', type: 'plasmid', length: RE_SEQ.length, sequence: RE_SEQ, annotations: [] }];

  it('renders the RE marker at FINITE coords (positions are {position} objects, not numbers)', () => {
    // Bug 21.06: reSites mapped `s.positions` (array of {position} objects)
    // as if each element were a number → re.pos = object → NaN coords →
    // markers drawn off-canvas («на карте не видны сайты»).
    act(() => { useStore.setState({ showReSites: true, reFilter: 'all' }); });
    render(<PlasmidMapV2 fragments={RE_FRAG} constructName="pRE" totalBp={RE_SEQ.length} />);
    const sites = screen.getAllByTestId('plasmid-v2-re-site');
    expect(sites.length).toBeGreaterThanOrEqual(1);
    sites.forEach((ln) => {
      expect(Number.isFinite(Number(ln.getAttribute('x1')))).toBe(true);
      expect(Number.isFinite(Number(ln.getAttribute('y1')))).toBe(true);
    });
  });

  it('labels the RE marker with the enzyme name', () => {
    act(() => { useStore.setState({ showReSites: true, reFilter: 'all' }); });
    const { container } = render(<PlasmidMapV2 fragments={RE_FRAG} constructName="pRE" totalBp={RE_SEQ.length} />);
    expect(container.textContent).toContain('EcoRI');
  });

  it('renders RE sites as external de-collided leader labels (not radial inner text)', () => {
    // two EcoRI sites, far apart → two separate external labels with positions
    const TWO = `GAATTC${'A'.repeat(194)}GAATTC${'A'.repeat(194)}`; // 400 bp
    const FRAG = [{ id: 'p', name: 'p2', length: TWO.length, sequence: TWO, annotations: [] }];
    act(() => { useStore.setState({ showReSites: true, reFilter: 'all' }); });
    render(<PlasmidMapV2 fragments={FRAG} totalBp={TWO.length} />);
    const labels = screen.getAllByTestId(/^plasmid-v2-re-label-/);
    expect(labels.length).toBe(2);
    // each external label carries the enzyme name + a leader polyline
    expect(labels[0].textContent).toContain('EcoRI');
    expect(labels[0].querySelector('polyline')).toBeTruthy();
  });

  it('collapses a tight same-enzyme cluster into one «×k» external label', () => {
    // three EcoRI packed at the very start → one «EcoRI ×3» marker on a long circle.
    // reEnzymesFilter isolates EcoRI (the digest-gel case) so the dense GAATTC
    // repeats don't pull in other enzymes' sites.
    const TIGHT = `GAATTCGAATTCGAATTC${'A'.repeat(982)}`; // 1000 bp, 3 sites in first 18 bp
    const FRAG = [{ id: 'p', name: 'pc', length: TIGHT.length, sequence: TIGHT, annotations: [] }];
    render(<PlasmidMapV2 fragments={FRAG} totalBp={TIGHT.length} reEnzymesFilter={['EcoRI']} />);
    const labels = screen.getAllByTestId(/^plasmid-v2-re-label-/);
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toMatch(/EcoRI\s*×3/);
    expect(labels[0].getAttribute('data-cluster')).toBe('true');
  });

  it('reEnzymesFilter restricts RE markers to the named enzyme(s) + hides the toolbar', () => {
    // one EcoRI (GAATTC) + one HindIII (AAGCTT) — gel должен показывать ТОЛЬКО фермент дайджеста.
    const MIX = `${'A'.repeat(10)}GAATTC${'A'.repeat(10)}AAGCTT${'A'.repeat(10)}`;
    const FRAG = [{ id: 'p', name: 'pmix', length: MIX.length, sequence: MIX, annotations: [] }];
    const { container } = render(<PlasmidMapV2 fragments={FRAG} totalBp={MIX.length} reEnzymesFilter={['EcoRI']} />);
    expect(container.textContent).toContain('EcoRI');
    expect(container.textContent).not.toContain('HindIII');
    // fixed digest context → no RE toggle/filter toolbar
    expect(screen.queryByTestId('plasmid-v2-re-toggle')).toBeNull();
  });

  it('onReSiteClick → clicking an RE label emits the marker (clickable sites)', () => {
    const onRe = vi.fn();
    const MIX = `${'A'.repeat(10)}GAATTC${'A'.repeat(34)}`;
    const FRAG = [{ id: 'p', name: 'p', length: MIX.length, sequence: MIX, annotations: [] }];
    render(<PlasmidMapV2 fragments={FRAG} totalBp={MIX.length} reEnzymesFilter={['EcoRI']} onReSiteClick={onRe} />);
    fireEvent.click(screen.getByTestId('plasmid-v2-re-label-0'));
    expect(onRe).toHaveBeenCalledTimes(1);
    expect(onRe.mock.calls[0][0]).toMatchObject({ enzyme: 'EcoRI' });
    expect(Array.isArray(onRe.mock.calls[0][0].positions)).toBe(true);
  });

  it('RE labels stay display-only (pointer-events:none) without onReSiteClick', () => {
    act(() => { useStore.setState({ showReSites: true, reFilter: 'all' }); });
    const MIX = `${'A'.repeat(10)}GAATTC${'A'.repeat(34)}`;
    const FRAG = [{ id: 'p', name: 'p', length: MIX.length, sequence: MIX, annotations: [] }];
    render(<PlasmidMapV2 fragments={FRAG} totalBp={MIX.length} />);
    expect(screen.getByTestId('plasmid-v2-re-label-0').getAttribute('style')).toMatch(/pointer-events:\s*none/i);
  });
});

describe('PlasmidMapV2 — digest bands (selectable fragments)', () => {
  const BANDS = [
    { index: 0, start: 0, end: 100, wraps: false, color: '#4A7C59' },
    { index: 1, start: 100, end: 300, wraps: false, color: '#b85c3e' },
  ];
  it('renders one selectable arc per band; clicking one calls onSelectBand', () => {
    const onSel = vi.fn();
    render(<PlasmidMapV2 length={300} bands={BANDS} selectedBandIndex={0} onSelectBand={onSel} />);
    expect(screen.getByTestId('plasmid-v2-band-0')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-band-1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plasmid-v2-band-1'));
    expect(onSel).toHaveBeenCalledWith(1);
  });
});

describe('PlasmidMapV2 — minimap mode (annotations + length, no sequence)', () => {
  it('derives features from annotations directly + shows centerLabel name', () => {
    const { container } = render(<PlasmidMapV2 annotations={ANNS} length={5000} centerLabel={{ name: 'pMini', bp: 5000 }} />);
    expect(screen.getByTestId('plasmid-v2-feature-0')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-feature-2')).toBeTruthy();
    expect(container.textContent).toContain('pMini');
  });

  it('hides the RE toolbar when there is no sequence to scan', () => {
    render(<PlasmidMapV2 annotations={ANNS} length={5000} centerLabel={{ name: 'pMini', bp: 5000 }} />);
    expect(screen.queryByTestId('plasmid-v2-re-toggle')).toBeNull();
  });

  it('calls onFeatureClick with the feature on click', () => {
    const onFeat = vi.fn();
    render(<PlasmidMapV2 annotations={ANNS} length={5000} onFeatureClick={onFeat} />);
    fireEvent.click(screen.getByTestId('plasmid-v2-feature-0'));
    expect(onFeat).toHaveBeenCalledTimes(1);
    expect(onFeat.mock.calls[0][0].name).toBe('PglaA');
  });

  it('applies a rotation transform to the rotating content group', () => {
    const { container } = render(<PlasmidMapV2 annotations={ANNS} length={5000} rotationDeg={45} />);
    const rotated = [...container.querySelectorAll('g')].some((g) => (g.getAttribute('transform') || '').includes('rotate(45'));
    expect(rotated).toBe(true);
  });
});

describe('PlasmidMapV2 — labels (wrap), zero-notch, rotation relayout', () => {
  const LONG = [
    { id: 'x', level: 'region', type: 'CDS', name: 'alpha factor secretion', start: 100, end: 900, strand: 1 },
  ];
  it('wraps a long feature name into multiple tspans (no single-line ellipsis)', () => {
    render(<PlasmidMapV2 annotations={LONG} length={3000} />);
    const tspans = screen.getByTestId('plasmid-v2-label-0').querySelectorAll('tspan');
    expect(tspans.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the fixed zero-notch origin marker (drawn on top, rotation-invariant)', () => {
    render(<PlasmidMapV2 annotations={ANNS} length={5000} />);
    expect(screen.getByTestId('plasmid-v2-origin')).toBeTruthy();
  });

  it('relayouts labels on rotation: the leader anchor moves with rotationDeg', () => {
    const points = (deg) => {
      const { container, unmount } = render(<PlasmidMapV2 annotations={ANNS} length={5000} rotationDeg={deg} />);
      const p = container.querySelector('[data-testid="plasmid-v2-label-0"] polyline').getAttribute('points');
      unmount();
      return p;
    };
    expect(points(0)).not.toBe(points(120));
  });
});

describe('PlasmidMapV2 — spliced genes show intron gaps', () => {
  const SPLICED = [
    { id: 'g', level: 'region', type: 'gene', name: 'glaA', start: 100, end: 900, strand: 1 },
    { id: 'i1', level: 'detail', type: 'intron', parentId: 'g', start: 300, end: 400 },
    { id: 'i2', level: 'detail', type: 'intron', parentId: 'g', start: 600, end: 650 },
  ];
  it('renders a gene with introns as exon blocks + dashed connectors (data-spliced)', () => {
    render(<PlasmidMapV2 annotations={SPLICED} length={3000} />);
    const feat = screen.getByTestId('plasmid-v2-feature-0');
    expect(feat.getAttribute('data-spliced')).toBe('true');
    // exonSegments(100,900,[[300,400],[600,650]]) → 3 exon blocks
    expect(feat.querySelectorAll('[data-testid="plasmid-v2-exon"]').length).toBe(3);
    // 2 intron connectors (the visible gaps)
    expect(feat.querySelectorAll('[data-testid^="plasmid-v2-intron-0-"]').length).toBe(2);
  });
  it('a gene WITHOUT introns stays a single solid arrow (no data-spliced)', () => {
    render(<PlasmidMapV2 annotations={[{ id: 'g2', level: 'region', type: 'CDS', name: 'AmpR', start: 100, end: 800, strand: 1 }]} length={3000} />);
    const feat = screen.getByTestId('plasmid-v2-feature-0');
    expect(feat.tagName.toLowerCase()).toBe('path');
    expect(feat.hasAttribute('data-spliced')).toBe(false);
  });
  it('still calls onFeatureClick when a spliced gene is clicked', () => {
    const onFeat = vi.fn();
    render(<PlasmidMapV2 annotations={SPLICED} length={3000} onFeatureClick={onFeat} />);
    fireEvent.click(screen.getByTestId('plasmid-v2-feature-0'));
    expect(onFeat).toHaveBeenCalledTimes(1);
    expect(onFeat.mock.calls[0][0].name).toBe('glaA');
  });
});
