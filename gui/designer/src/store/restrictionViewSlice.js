/**
 * restrictionViewSlice (RS-B3) — formalises the RE-site VIEW knobs that used to
 * live as ad-hoc store fields written via `useStore.setState(...)` (no slice,
 * undefined until first touched). Gives named setters + an explicit `reActiveSet`
 * (the «active set» enzyme allow-list, consumed by the shared visibility filter
 * in RS-C4).
 *
 * The three legacy fields (showReSites / reFilter / reMinSiteLen) are intentionally
 * NOT initialised here — consumers already default them (`reFilter || 'all'`,
 * `reMinSiteLen || 6`, falsy showReSites) and several tests rely on the
 * write-on-demand behaviour; the setters below mutate them in place.
 */
export const createRestrictionViewSlice = (set) => ({
  // The active enzyme SET applied as a visibility allow-list across the map +
  // sequence view (RS-C4). null = no active set (show per the cut-count filter).
  reActiveSet: null,

  setShowReSites: (v) => set((s) => { s.showReSites = !!v; }),
  toggleReSites: () => set((s) => { s.showReSites = !s.showReSites; }),
  setReFilter: (id) => set((s) => { s.reFilter = id; }),
  setReMinSiteLen: (n) => set((s) => { s.reMinSiteLen = n; }),
  /** Set/clear the active enzyme set (allow-list). Pass null to clear. */
  setReActiveSet: (setObj) => set((s) => { s.reActiveSet = setObj || null; }),
});

/** Resolve the active-set enzyme allow-list to a plain name array (or null). */
export function selectActiveSetEnzymes(state) {
  const a = state && state.reActiveSet;
  return a && Array.isArray(a.enzymes) && a.enzymes.length ? a.enzymes : null;
}
