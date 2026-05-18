/**
 * piece-zones-alias.test.jsx — T6 K13 (DEC-T6 §5.7, R-T6-6).
 *
 * SegmentZonesOverlay backdrop is fed through SequenceView. T6 renames
 * the `coloredZones` prop to `pieceZones` (4-tier vocabulary) while
 * keeping `coloredZones` as a back-compat alias: `pieceZones ?? coloredZones`.
 * Library / Importer / PCR keep passing `coloredZones` unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';

describe('T6 K13 — pieceZones prop + coloredZones back-compat alias', () => {
  it('pieceZones renders one coloured backdrop zone per piece', () => {
    const pieceZones = [
      { zoneId: 'pc1', start: 0, end: 16, color: '#8b5cf6', label: 'A' },
      { zoneId: 'pc2', start: 16, end: 32, color: '#ec4899', label: 'B' },
    ];
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        pieceZones={pieceZones}
      />,
    );
    const zones = screen.getAllByTestId('sequence-view-zone');
    const ids = zones.map((z) => z.getAttribute('data-zone-id'));
    expect(ids).toContain('pc1');
    expect(ids).toContain('pc2');
  });

  it('back-compat: coloredZones (legacy prop) still renders zones', () => {
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={[{ zoneId: 's1', start: 0, end: 32, color: '#06b6d4' }]}
      />,
    );
    const ids = screen
      .getAllByTestId('sequence-view-zone')
      .map((z) => z.getAttribute('data-zone-id'));
    expect(ids).toContain('s1');
  });

  it('pieceZones takes precedence when both props are passed', () => {
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={[{ zoneId: 'legacy', start: 0, end: 32, color: '#06b6d4' }]}
        pieceZones={[{ zoneId: 'fresh', start: 0, end: 32, color: '#8b5cf6' }]}
      />,
    );
    const ids = screen
      .getAllByTestId('sequence-view-zone')
      .map((z) => z.getAttribute('data-zone-id'));
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('legacy');
  });

  it('neither prop → no zones (Library/Importer/PCR back-compat)', () => {
    render(<SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x" />);
    expect(screen.getByTestId('sequence-view-root')).toBeTruthy();
    expect(screen.queryAllByTestId('sequence-view-zone')).toHaveLength(0);
  });
});
