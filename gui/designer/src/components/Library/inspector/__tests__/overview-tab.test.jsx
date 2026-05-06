/**
 * Sprint M-B.2 K3 — OverviewTab integration: PlasmidMiniMap + categorised
 * sections + region counts surface in DOM.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OverviewTab from '../tabs/OverviewTab';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: ({ size }) => <div data-testid="mock-mini-map" data-size={size} />,
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
  it('1) renders PlasmidMiniMap (180 px) + types strip', () => {
    render(<OverviewTab item={ITEM} />);
    const mini = screen.getByTestId('mock-mini-map');
    expect(mini.dataset.size).toBe('180');
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
