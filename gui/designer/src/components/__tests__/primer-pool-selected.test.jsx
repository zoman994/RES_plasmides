/**
 * PrimerPoolList — a primer picked in global search (§10.4) arrives via `selectedPrimerId`
 * and its row is highlighted (aria-current) + scrolled into view. Even an ARCHIVED primer
 * the default `active` filter hides is forced visible, and a primer that hydrates LATE
 * still resolves once its row appears.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useStore } from '../../store';
import PrimerPoolList from '../PrimerPoolList';

beforeEach(() => {
  useStore.setState((s) => {
    s.primersById = {
      pr1: { id: 'pr1', name: 'T7-fwd', sequence: 'TAATACGACTCACTATAGGG', status: 'ordered', tags: [] },
      pr2: { id: 'pr2', name: 'T7-rev', sequence: 'GCTAGTTATTGCTCAGCGG', status: 'ordered', tags: [] },
    };
    s.projects = {};
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

describe('PrimerPoolList — selectedPrimerId highlight (§10.4)', () => {
  it('marks the picked primer row aria-current and leaves the others unmarked', () => {
    render(<PrimerPoolList selectedPrimerId="pr2" />);
    expect(screen.getByTestId('primer-pool-row-pr2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('primer-pool-row-pr1').getAttribute('aria-current')).toBeNull();
  });
  it('no selection → no row is marked', () => {
    render(<PrimerPoolList />);
    expect(screen.getByTestId('primer-pool-row-pr1').getAttribute('aria-current')).toBeNull();
  });

  it('forces an ARCHIVED picked primer visible even under the default «active» filter', () => {
    useStore.setState((s) => {
      s.primersById = { arc: { id: 'arc', name: 'old-oligo', sequence: 'ACGTACGT', status: 'archived', tags: [] } };
    });
    render(<PrimerPoolList selectedPrimerId="arc" />); // filter defaults to «active» → would hide archived
    const row = screen.getByTestId('primer-pool-row-arc');
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('scrolls the picked primer row into view', () => {
    const scrollSpy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollSpy;
    try {
      render(<PrimerPoolList selectedPrimerId="pr2" />);
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  it('resolves a LATE-hydrated selected primer once its row appears', () => {
    useStore.setState((s) => { s.primersById = { pr1: s.primersById.pr1 }; });
    render(<PrimerPoolList selectedPrimerId="late" />);
    expect(screen.queryByTestId('primer-pool-row-late')).toBeNull(); // not in the pool yet
    act(() => {
      useStore.setState((s) => {
        s.primersById = { ...s.primersById, late: { id: 'late', name: 'hydrated', sequence: 'GGGCCC', status: 'imported', tags: [] } };
      });
    });
    expect(screen.getByTestId('primer-pool-row-late').getAttribute('aria-current')).toBe('true');
  });
});
