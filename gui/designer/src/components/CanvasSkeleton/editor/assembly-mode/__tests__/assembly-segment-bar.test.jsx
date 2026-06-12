/**
 * assembly-segment-bar.test.jsx — M-WORKSPACE R1 «блок сборки сверху».
 *
 * AssemblySegmentBar presents the assembled fragments as a prominent top
 * plashka (proportional coloured segments + a clickable junction ромб at each
 * internal boundary), above the sequence string. It is a pure presentation of
 * the SAME `coloredZones` (enriched with `junctionRight`) that SegmentZonesOverlay
 * draws on the sequence strip, so it speaks the SAME onZoneClick contract:
 *   - segment click → onZoneClick(zoneId: string)
 *   - junction ромб click → onZoneClick({ ...junctionRight, clientX, clientY })
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import AssemblySegmentBar from '../AssemblySegmentBar';

afterEach(cleanup);

const jr = (pairKey, state, extra = {}) => ({
  pairKey,
  method: 'overlap_pcr',
  kind: 'overlap',
  state,
  differsFromAssembly: false,
  stroke: '#185FA5',
  fill: '#378ADD',
  fromPieceId: pairKey.split('__')[0],
  toPieceId: pairKey.split('__')[1],
  ...extra,
});

// Three segments → two internal junctions (the last segment has no junctionRight).
const ENRICHED = [
  {
    zoneId: 's1', start: 0, end: 100, color: '#378ADD', label: 'T7',
    junctionRight: jr('s1__s2', 'decided'),
  },
  {
    zoneId: 's2', start: 100, end: 130, color: '#639922', label: 'GFP',
    junctionRight: jr('s2__s3', 'tentative'),
  },
  { zoneId: 's3', start: 130, end: 220, color: '#BA7517', label: 'term' },
];

describe('AssemblySegmentBar — segments + clickable junction diamonds', () => {
  it('renders the bar with one segment per coloredZone', () => {
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={() => {}} />);
    expect(screen.getByTestId('assembly-segment-bar')).toBeTruthy();
    expect(screen.getAllByTestId('assembly-segment')).toHaveLength(3);
  });

  it('segment width is proportional to its assembly span (flex-grow)', () => {
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={() => {}} />);
    const segs = screen.getAllByTestId('assembly-segment');
    const grow = (el) => parseFloat(el.style.flexGrow);
    // s1 span 100 > s3 span 90 > s2 span 30.
    expect(grow(segs[0])).toBeGreaterThan(grow(segs[2]));
    expect(grow(segs[2])).toBeGreaterThan(grow(segs[1]));
  });

  it('clicking a segment calls onZoneClick with the zoneId (string)', () => {
    let got;
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={(a) => { got = a; }} />);
    fireEvent.click(screen.getAllByTestId('assembly-segment')[1]);
    expect(got).toBe('s2');
  });

  it('renders one junction diamond per internal boundary (N-1)', () => {
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={() => {}} />);
    const diamonds = screen.getAllByTestId('assembly-junction');
    expect(diamonds).toHaveLength(2);
    expect(diamonds.map((d) => d.getAttribute('data-pair-key')))
      .toEqual(['s1__s2', 's2__s3']);
  });

  it('diamond carries kind + trust state; decided is filled, tentative hollow', () => {
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={() => {}} />);
    const [d1, d2] = screen.getAllByTestId('assembly-junction');
    expect(d1.getAttribute('data-junction-state')).toBe('decided');
    expect(d2.getAttribute('data-junction-state')).toBe('tentative');
    expect(d1.getAttribute('data-junction-kind')).toBe('overlap');
    // decided → filled glyph; tentative → transparent (hollow) glyph.
    const glyph = (btn) => btn.querySelector('[data-testid="junction-diamond"]');
    expect(glyph(d1).style.background).not.toBe('transparent');
    expect(glyph(d2).style.background).toBe('transparent');
  });

  // V145 — each junction reads as a clickable button (round affordance plate
  // that lifts on hover), not a decorative marker.
  it('each junction is a clickable button with a round affordance plate', () => {
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={() => {}} />);
    for (const d of screen.getAllByTestId('assembly-junction')) {
      expect(d.classList.contains('bg-junction-btn')).toBe(true);
      const chip = d.querySelector('.bg-junction-chip');
      expect(chip).toBeTruthy();
      expect(chip.querySelector('[data-testid="junction-diamond"]')).toBeTruthy();
    }
  });

  it('clicking a junction calls onZoneClick with the descriptor + click coords', () => {
    let got;
    render(<AssemblySegmentBar coloredZones={ENRICHED} onZoneClick={(a) => { got = a; }} />);
    fireEvent.click(screen.getAllByTestId('assembly-junction')[0], { clientX: 42, clientY: 17 });
    expect(got).toBeTypeOf('object');
    expect(got.pairKey).toBe('s1__s2');
    expect(got.fromPieceId).toBe('s1');
    expect(got.toPieceId).toBe('s2');
    expect(got).toHaveProperty('clientX');
    expect(got).toHaveProperty('clientY');
  });

  it('plain (legacy, no junctionRight) zones render no diamonds', () => {
    const plain = [
      { zoneId: 'a', start: 0, end: 10, color: '#378ADD', label: 'A' },
      { zoneId: 'b', start: 10, end: 20, color: '#639922', label: 'B' },
    ];
    render(<AssemblySegmentBar coloredZones={plain} onZoneClick={() => {}} />);
    expect(screen.getAllByTestId('assembly-segment')).toHaveLength(2);
    expect(screen.queryAllByTestId('assembly-junction')).toHaveLength(0);
  });

  it('an orphan segment is flagged (data-orphan)', () => {
    const withOrphan = [
      { zoneId: 'o', start: 0, end: 10, color: '#888', label: 'orphan', isOrphan: true },
    ];
    render(<AssemblySegmentBar coloredZones={withOrphan} onZoneClick={() => {}} />);
    expect(screen.getByTestId('assembly-segment').getAttribute('data-orphan')).toBe('true');
  });

  it('renders nothing for empty / missing zones', () => {
    const { container } = render(<AssemblySegmentBar coloredZones={[]} onZoneClick={() => {}} />);
    expect(container.querySelector('[data-testid="assembly-segment-bar"]')).toBeNull();
  });
});
