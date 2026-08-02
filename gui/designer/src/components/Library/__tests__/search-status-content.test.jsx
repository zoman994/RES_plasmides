/**
 * SearchStatusContent — parity pin for the status table extracted out of LibrarySmartSearchBar.
 *
 * The extraction must not move a single decision. So this file does NOT hardcode status kinds:
 * every case is driven through the REAL projection (`deriveSearchSessionPresentation`) and its
 * verdict is handed to the component. That pins BOTH halves of the seam at once — if a future
 * edit renames a kind on one side, or starts deciding precedence inside JSX, this goes red.
 *
 * The states are the full ladder the bar can reach: hidden, checking, incomplete, cancelled,
 * requiresAlignment, complete-empty, complete-results.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SearchStatusContent from '../SearchStatusContent';
import { deriveSearchSessionPresentation } from '../../../lib/search-session-presentation';
import { t } from '../../../i18n';

const base = {
  ownsQuery: true, phase: 'final', rowCount: 0, providerExpected: false,
  providerPending: false, incomplete: false, blocked: false,
};
/** The bar's own call shape: projection first, wording second. */
const show = (over, props = {}) => {
  const presentation = deriveSearchSessionPresentation({ ...base, ...over });
  const utils = render(
    <SearchStatusContent
      statusKind={presentation.statusKind}
      incompleteText="check did not run: DNA"
      {...props}
    />,
  );
  return { ...utils, presentation };
};

afterEach(cleanup);

describe('SearchStatusContent — one message per projected state', () => {
  it('hidden announces nothing at all', () => {
    const { container, presentation } = show({ ownsQuery: false, rowCount: 5 });
    expect(presentation.state).toBe('hidden');
    expect(container.innerHTML).toBe('');
  });

  it('a completed check WITH results announces nothing extra', () => {
    const { container, presentation } = show({ phase: 'final', rowCount: 3 });
    expect(presentation.state).toBe('complete-results');
    expect(container.innerHTML).toBe('');
  });

  it('a completed check with NO results is the only state allowed to say «nothing found»', () => {
    const { presentation } = show({ phase: 'final', rowCount: 0 });
    expect(presentation.state).toBe('complete-empty');
    expect(screen.getByText(t('search.results.empty'))).toBeTruthy();
  });

  it('checking offers the stop action', () => {
    const onCancel = vi.fn();
    const { presentation } = show(
      { phase: 'partial', providerExpected: true, rowCount: 1 }, { onCancel },
    );
    expect(presentation.state).toBe('checking');
    fireEvent.click(screen.getByTestId('search-cancel-action'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('incomplete names the failed provider and never says «nothing found»', () => {
    const { presentation } = show({ incomplete: true, rowCount: 1 });
    expect(presentation.state).toBe('incomplete');
    expect(screen.getByTestId('search-provider-incomplete-warning').textContent)
      .toContain('check did not run: DNA');
    expect(screen.queryByText(t('search.results.empty'))).toBeNull();
  });

  it('cancelled offers resume and never says «nothing found»', () => {
    const onResume = vi.fn();
    const { presentation } = show({ cancelled: true, rowCount: 1 }, { onResume });
    expect(presentation.state).toBe('cancelled');
    fireEvent.click(screen.getByTestId('search-cancelled-resume'));
    expect(onResume).toHaveBeenCalled();
    expect(screen.queryByText(t('search.results.empty'))).toBeNull();
  });

  it('blocked falls back to the generic wording when no diagnostic is supplied', () => {
    show({ blocked: true });
    expect(screen.getByTestId('search-blocked-notice').textContent).toContain(t('search.results.blocked'));
    cleanup();
    show({ blocked: true }, { blockingText: 'conflicting query' });
    expect(screen.getByTestId('search-blocked-notice').textContent).toContain('conflicting query');
  });
});

describe('SearchStatusContent — the §4.2.0 route', () => {
  it('states the limit from the ROUTE, not the module default', () => {
    show({ requiresAlignment: true, rowCount: 0 }, { maxApproxLength: 100 });
    expect(screen.getByTestId('search-requires-alignment-notice').textContent).toContain('100');
  });

  it('offers the action and hands the query to it', () => {
    const onOpenAlignment = vi.fn();
    show({ requiresAlignment: true, rowCount: 0 }, { onOpenAlignment, query: 'ACGTACGTACGT' });
    fireEvent.click(screen.getByTestId('search-requires-alignment-action'));
    expect(onOpenAlignment).toHaveBeenCalledWith('ACGTACGTACGT');
  });

  // The component stays honest about what it was given: no handler → no action, rather than a
  // button that does nothing when clicked. That the APP always supplies one is a separate promise,
  // pinned in `library-requires-alignment-wiring.test.jsx` — which is where BG-023 actually lived.
  it('without a handler the notice renders WITHOUT an action, never a dead button', () => {
    show({ requiresAlignment: true, rowCount: 0 });
    expect(screen.getByTestId('search-requires-alignment-notice')).toBeTruthy();
    expect(screen.queryByTestId('search-requires-alignment-action')).toBeNull();
  });

  it('is never «nothing found»: the absence was never established', () => {
    show({ requiresAlignment: true, rowCount: 0 });
    expect(screen.queryByText(t('search.results.empty'))).toBeNull();
  });
});
