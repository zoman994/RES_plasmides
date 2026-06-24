/**
 * RS-B2 — RestrictionPanel exposes an exact-«2 разреза» visibility filter
 * alongside Уникальные / ≤2 / Все, wired through the RS-B3 named setter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RestrictionPanel from '../RestrictionPanel';
import { useStore } from '../../../store';

beforeEach(() => { useStore.setState({ showReSites: true, reFilter: 'all' }); });
afterEach(cleanup);

describe('RestrictionPanel — cut-count visibility filters (RS-B2)', () => {
  it('renders the «2 разреза» (exact-2) filter button', () => {
    render(<RestrictionPanel />);
    const btn = screen.getByTestId('skeleton-restriction-filter-cut2');
    expect(btn.textContent).toMatch(/2 разреза/);
  });

  it('clicking «2 разреза» sets reFilter=cut2 via the slice setter', () => {
    render(<RestrictionPanel />);
    fireEvent.click(screen.getByTestId('skeleton-restriction-filter-cut2'));
    expect(useStore.getState().reFilter).toBe('cut2');
  });

  it('still offers Уникальные / ≤ 2 / Все', () => {
    render(<RestrictionPanel />);
    expect(screen.getByTestId('skeleton-restriction-filter-unique')).toBeTruthy();
    expect(screen.getByTestId('skeleton-restriction-filter-double')).toBeTruthy();
    expect(screen.getByTestId('skeleton-restriction-filter-all')).toBeTruthy();
  });
});
