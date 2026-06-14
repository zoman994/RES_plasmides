/**
 * overview-tab-nav.test.jsx — Overview feature click → navigate.
 *
 * Real-case sweep: Overview mini-map + list rows were read-only (cursor:help,
 * no click). They now navigate to the feature in the Sequence tab when an
 * onNavigateToFeature callback is wired; read-only without it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OverviewTab from '../tabs/OverviewTab';
import { useStore } from '../../../../store';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: ({ onFeatureClick }) => (
    <div data-testid="mock-mini-map" data-has-featclick={onFeatureClick ? 'yes' : 'no'} />
  ),
}));

beforeEach(() => { try { useStore.setState({ libraryEntries: {} }); } catch { /* */ } });
afterEach(cleanup);

const ITEM = {
  id: 'e1', name: 'pUC19', length: 2700, sequence: 'A'.repeat(2700), topology: 'circular',
  annotations: [
    { id: 'r1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
    { id: 'r2', type: 'promoter', name: 'lac promoter', start: 1000, end: 1100, level: 'region' },
    { id: 'r5', type: 'CDS', name: 'ORF1', start: 2300, end: 2500, level: 'region' },
  ],
};

describe('OverviewTab — feature click navigation', () => {
  it('passes onFeatureClick to the mini-map + makes list rows clickable when wired', () => {
    const onNavigateToFeature = vi.fn();
    render(<OverviewTab item={ITEM} onNavigateToFeature={onNavigateToFeature} />);
    expect(screen.getByTestId('mock-mini-map').getAttribute('data-has-featclick')).toBe('yes');
    // click the ORF1 CDS row → navigates to that region
    fireEvent.click(screen.getByTestId('overview-feature-r5'));
    expect(onNavigateToFeature).toHaveBeenCalledWith(expect.objectContaining({ id: 'r5', start: 2300 }));
    // a category row (promoter) is clickable too
    fireEvent.click(screen.getByTestId('overview-feature-r2'));
    expect(onNavigateToFeature).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
  });

  it('rows stay read-only (not clickable) when onNavigateToFeature is absent', () => {
    render(<OverviewTab item={ITEM} />);
    expect(screen.getByTestId('mock-mini-map').getAttribute('data-has-featclick')).toBe('no');
    expect(screen.queryByTestId('overview-feature-r5')).toBeNull();
  });
});
