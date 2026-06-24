/**
 * Sprint M-B.2 K3 — OverviewTab integration: plasmid map (V2) + categorised
 * sections + region counts surface in DOM.
 *
 * Circular items now render the redesigned PlasmidMapV2 (DEC-DS-PLASMIDMAP-V2,
 * feature-flag plasmidMapV2). We mock it to a thin probe — the map's own
 * geometry/render is covered by plasmid-map-v2.test.jsx.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OverviewTab from '../tabs/OverviewTab';

vi.mock('../../../PlasmidMapV2', () => ({
  default: ({ length, centerLabel }) => (
    <div data-testid="mock-pmv2" data-length={length} data-name={centerLabel?.name || ''} />
  ),
}));

afterEach(cleanup);

const ITEM = {
  name: 'pUC19',
  sequence: 'A'.repeat(2700),
  length: 2700,
  topology: 'circular',
  annotations: [
    { id: 'r1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
    { id: 'r2', type: 'promoter', name: 'lac promoter', start: 1000, end: 1100, level: 'region' },
    { id: 'r3', type: 'rep_origin', name: 'pUC ori', start: 1500, end: 2200, level: 'region' },
    { id: 'r4', type: 'CDS', name: 'His6', start: 2200, end: 2230, level: 'region' },
    { id: 'r5', type: 'CDS', name: 'ORF1', start: 2300, end: 2500, level: 'region' },
  ],
};

describe('M-B.2 K3 — OverviewTab', () => {
  it('1) renders the V2 plasmid map (circular overview) + types strip', () => {
    render(<OverviewTab item={ITEM} />);
    const map = screen.getByTestId('mock-pmv2');
    expect(map.dataset.length).toBe('2700');
    expect(screen.getByTestId('importer-overview-types')).toBeTruthy();
  });

  it('2) categorised sections show up for SELECTION + PROMOTERS + ORIGINS + TAGS', () => {
    render(<OverviewTab item={ITEM} />);
    expect(screen.getByTestId('importer-cat-selection')).toBeTruthy();
    expect(screen.getByTestId('importer-cat-promoters')).toBeTruthy();
    expect(screen.getByTestId('importer-cat-origins')).toBeTruthy();
    expect(screen.getByTestId('importer-cat-tags')).toBeTruthy();
  });

  it('3) remaining CDS list surfaces ORF1 (not bucketed elsewhere)', () => {
    render(<OverviewTab item={ITEM} />);
    const cds = screen.getByTestId('importer-overview-cds');
    expect(cds.textContent).toContain('ORF1');
  });

  it('4) returns null on empty parsedItem', () => {
    const { container } = render(<OverviewTab item={null} />);
    expect(container.firstChild).toBeNull();
  });
});
