/**
 * Test harness for LibraryTopBar (REV#2 Stage 3 K4.2b∪K5). The bar no longer takes a raw
 * `query` string — it takes the structured `globalSearch` controller (useSearchQueryState),
 * owned by LibraryWorkspace. These tests drive the bar through the REAL controller so the
 * controller→facade wiring (canonical query drives the search, `runnable` gates a blocked one)
 * is exercised end-to-end: `renderTopBar({ query })` seeds the controller from `query` exactly
 * as the tree's «Полный поиск» escalation does, and its `rerender` re-seeds.
 */
import React, { useEffect } from 'react';
import { render } from '@testing-library/react';
import { useSearchQueryState } from '../hooks/useSearchQueryState';
import { SEARCH_PROFILES } from '../../../lib/search-profiles';
import LibraryTopBar from '../LibraryTopBar';

export function Harness({ query = '', resolveProjectName, ...rest }) {
  const search = useSearchQueryState({ capabilities: SEARCH_PROFILES.globalLibrary, resolveProjectName });
  // Seed (replace) the controller from the raw query whenever it changes — the same path the
  // tree escalation / enzyme card use. Not in the deps: `search` is recreated every render; we
  // deliberately re-seed only on a query change.
  useEffect(() => { search.seedGlobalQuery(query); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  return <LibraryTopBar search={search} {...rest} />;
}

export function renderTopBar({ query = '', ...rest } = {}) {
  const utils = render(<Harness query={query} {...rest} />);
  return {
    ...utils,
    rerender: ({ query: q2 = '', ...r2 } = {}) => utils.rerender(<Harness query={q2} {...r2} />),
  };
}
