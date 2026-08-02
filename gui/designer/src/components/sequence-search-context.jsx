/**
 * sequence-search-context — the React seam for the app-wide sequence-search owner.
 *
 * Split from the Provider component on purpose (the same shape as `CanvasSkeleton/store/
 * skeleton-context.jsx`): a module that exports BOTH a component and a hook breaks fast refresh,
 * and the lint rule's own remedy is a separate file. Keeping the context here also means a consumer
 * can reach the channel without importing the Provider that owns the lifetime.
 */
import { createContext, useContext, useMemo } from 'react';

export const SequenceSearchContext = createContext(null);

/**
 * The channel for one owner. Throws when used outside the Provider — a surface that searches
 * without an owner would fall back to its own worker, which is precisely the second heavy pass the
 * whole indirection exists to prevent. Failing loudly here is cheaper than discovering it on a weak
 * machine.
 * @param {'global'|'popover'} owner
 */
export function useSequenceSearchChannel(owner) {
  const api = useContext(SequenceSearchContext);
  if (!api) throw new Error('useSequenceSearchChannel requires <SequenceSearchProvider>');
  return useMemo(() => api.channel(owner), [api, owner]);
}
