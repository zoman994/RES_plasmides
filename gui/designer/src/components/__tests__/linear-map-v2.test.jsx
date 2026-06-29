/**
 * LinearMapV2 — the linear «колбаска» map (Игорь 22.06: «линейная — когда сам
 * входной фрагмент линейный … клик по сайту и выбралось»). Features + clickable
 * RE sites on a horizontal axis; scans circular:false so no phantom origin site.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LinearMapV2 from '../LinearMapV2';

afterEach(cleanup);

// Linear fragment: EcoRI (GAATTC) at 0 and at 26; one CDS feature 6..26.
const SEQ = `GAATTC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}`;
const ANN = [{ id: 'f1', level: 'region', type: 'CDS', name: 'gene', start: 6, end: 26, strand: 1 }];
const frag = [{ sequence: SEQ, annotations: ANN, length: SEQ.length }];

const renderMap = (props = {}) => render(
  <LinearMapV2
    fragments={frag}
    totalBp={SEQ.length}
    topology="linear"
    constructName="pTest"
    reEnzymesFilter={['EcoRI']}
    {...props}
  />,
);

describe('LinearMapV2', () => {
  it('renders the linear map root + a horizontal layout (not a circle)', () => {
    renderMap();
    expect(screen.getByTestId('linear-map-v2')).toBeTruthy();
    // No circular-map artifacts.
    expect(screen.queryByTestId('plasmid-map-v2')).toBeNull();
  });

  it('renders the feature, clickable', () => {
    const onFeatureClick = vi.fn();
    renderMap({ onFeatureClick });
    const feat = screen.getByTestId('linear-map-v2-feature-0');
    fireEvent.click(feat);
    expect(onFeatureClick).toHaveBeenCalled();
  });

  it('draws an RE tick per cut (two EcoRI sites → two ticks, no phantom origin)', () => {
    renderMap();
    expect(screen.getAllByTestId('linear-map-v2-re-site')).toHaveLength(2);
  });

  it('clicking an RE label emits the marker', () => {
    const onReSiteClick = vi.fn();
    renderMap({ onReSiteClick });
    const labels = screen.getAllByTestId(/^linear-map-v2-re-label-/);
    expect(labels.length).toBeGreaterThan(0);
    fireEvent.click(labels[0]);
    expect(onReSiteClick).toHaveBeenCalledWith(expect.objectContaining({ enzyme: 'EcoRI' }));
  });

  it('RE labels are display-only (no pointer) when onReSiteClick is absent', () => {
    renderMap();
    const g = screen.getAllByTestId(/^linear-map-v2-re-label-/)[0];
    expect(g.getAttribute('data-clickable')).toBe('false');
  });
});

// UX-1 / V-FEAT-3 — sub-features (detail, e.g. introns/domains) + points
// (mutations/RE) must be VISIBLE on the linear map, nested in the parent's lane,
// not just region-level arrows. A fungal gene with introns looked solid before.
describe('LinearMapV2 — sub-features + points (UX-1)', () => {
  const ANN2 = [
    { id: 'g1', level: 'region', type: 'CDS', name: 'glaA', start: 0, end: 120, strand: 1 },
    { id: 'i1', level: 'detail', type: 'intron', name: 'intron 1', regionId: 'g1', start: 30, end: 60, strand: 1 },
    { id: 'd2', level: 'detail', type: 'domain', name: 'catalytic', regionId: 'g1', start: 70, end: 110, strand: 1 },
    { id: 'm1', level: 'point', type: 'mutation', name: 'C96S', regionId: 'g1', start: 96, end: 97 },
  ];
  const renderAnn = (props = {}) => render(
    <LinearMapV2 annotations={ANN2} length={120} totalBp={120} topology="linear" constructName="glaA" {...props} />,
  );

  it('renders detail sub-features (intron + domain) nested in the gene', () => {
    renderAnn();
    expect(screen.getByTestId('linear-map-v2-feature-0')).toBeTruthy(); // region still drawn
    expect(screen.getByTestId('linear-map-v2-detail-0')).toBeTruthy();
    expect(screen.getByTestId('linear-map-v2-detail-1')).toBeTruthy();
  });

  it('renders point annotations (mutation) as markers', () => {
    renderAnn();
    expect(screen.getByTestId('linear-map-v2-point-0')).toBeTruthy();
  });

  it('clicking a sub-feature selects it (onSelectRegion with its id)', () => {
    const onSelectRegion = vi.fn();
    renderAnn({ onSelectRegion });
    fireEvent.click(screen.getByTestId('linear-map-v2-detail-0'));
    expect(onSelectRegion).toHaveBeenCalledWith('i1');
  });

  it('no detail/point layer when only region-level annotations exist', () => {
    render(<LinearMapV2 annotations={[ANN2[0]]} length={120} totalBp={120} topology="linear" />);
    expect(screen.queryByTestId('linear-map-v2-detail-0')).toBeNull();
    expect(screen.queryByTestId('linear-map-v2-point-0')).toBeNull();
  });
});

describe('LinearMapV2 — fragment (incomplete) features (UX-4)', () => {
  const ANN_FRAG = [
    { id: 'whole', level: 'region', type: 'CDS', name: 'AmpR', start: 0, end: 200, strand: 1 },
    { id: 'frag', level: 'region', type: 'CDS', name: 'KanR_part_1-100', start: 300, end: 500, strand: 1 },
  ];

  it('an incomplete (_part_) feature renders white fill + coloured outline', () => {
    const { container } = render(<LinearMapV2 annotations={ANN_FRAG} length={1000} totalBp={1000} topology="linear" />);
    const frag = container.querySelector('[data-testid^="linear-map-v2-feature-"][data-fragment="true"]');
    expect(frag).toBeTruthy();
    const path = frag.querySelector('path');
    expect(path.getAttribute('fill')).toMatch(/surface/);
    expect(path.getAttribute('stroke')).not.toBe('#ffffff');
  });

  it('a complete feature keeps a coloured fill (no data-fragment)', () => {
    const { container } = render(<LinearMapV2 annotations={ANN_FRAG} length={1000} totalBp={1000} topology="linear" />);
    const whole = [...container.querySelectorAll('[data-testid^="linear-map-v2-feature-"]')]
      .find((n) => n.getAttribute('data-fragment') !== 'true');
    expect(whole).toBeTruthy();
    expect(whole.querySelector('path').getAttribute('fill')).not.toMatch(/surface/);
  });
});
