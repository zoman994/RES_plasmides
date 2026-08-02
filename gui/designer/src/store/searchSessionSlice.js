/**
 * searchSessionSlice — the STORE HALF of global-search ownership, and the home of the document
 * identity every jump is checked against (U5-B).
 *
 * WHY AN OWNER OUTSIDE THE BAR. Not because the bar unmounts — it does not: `LibraryTopBar` is an
 * unconditional sibling of the inspector region in `LibraryWorkspace`, so opening a molecule flips
 * one ternary far below it and the bar's own state survives intact. (An earlier version of this
 * header claimed the opposite; it was wrong, and it made the rows look like something that had to be
 * rescued rather than reached.) The real reasons are two: the Back contract needs an actor OUTSIDE
 * the bar's DOM to command it, and there must be exactly ONE copy of the query and the session —
 * a second copy is how two surfaces start disagreeing about what was searched.
 *
 * THE SESSION LIVES IN TWO LAYERS, and this header used to claim otherwise. It said «ONE owner»
 * while the result, the phase and the provider verdicts were still local state inside the bar, which
 * made the sentence describe an intention rather than the code. The split now is:
 *
 *   • HERE — the serialisable facts that must outlive any component: the RETURN FRAME (the
 *     structured query state, the session verdict, the confirmed rows, the corpus generation they
 *     describe, `scrollTop`, `activeKey`, the entry it was opened from), the corpus and per-entry
 *     generations, the per-entry BUFFER generation, and the parked sequence-nav request.
 *   • `hooks/useGlobalSearchController` — the live machinery a store must never hold: the worker
 *     channel, the debounce, the in-flight run, the refs, the ranked rows.
 *
 * Neither layer holds a second copy of the QUERY: that belongs to `useSearchQueryState`, and both
 * read it from there. A second copy is how two surfaces start disagreeing about what was searched.
 *
 * WHAT MUST NEVER LIVE HERE: workers, promises, DOM nodes, callbacks.
 */

// `librarySnapshotId` used to live here — removed rather than left looking usable. It only read
// entry ids and versions, so a rename, a retag, a status change, an annotation edit, a project or
// primer change and a soft-delete all left it byte-identical: a Back built on it would have shown
// stale confirmed rows as if they were current. Its replacement is a monotonic corpus generation
// (bumped from the identity of the corpus-bearing store fields), which lands with the Back contract
// that consumes it. Nothing referenced this function.

/**
 * Register the ONE watcher that ages the search corpus. Called once, at store creation.
 *
 * The corpus is «everything a SearchDocument is built from»: entries, projects, primers, and all
 * their searchable metadata (name, tags, status, annotations, sequence, topology). Watching the
 * OBJECT IDENTITY of the three maps catches every one of those in O(1): immer replaces the map on
 * any write beneath it, so a rename, a retag, a status flip, an annotation edit, a soft-delete and
 * an import all change identity, while a theme toggle or a modal open does not. Over-invalidation is
 * acceptable here (a redundant re-search costs a moment); a missed change is not (it would let Back
 * present rows from a library that no longer exists as if they were current).
 */
export function registerSearchCorpusWatcher(store) {
  // SEEDED at registration with what the store already holds. Starting from `null` made the FIRST
  // mutation a no-op — it was only recorded, never counted — so a frame captured at generation 0
  // survived the first import or rename of the session and Back would have replayed rows from
  // before it. The first change must age the corpus like every other.
  let prevMaps = [store.getState().libraryEntries, store.getState().projects, store.getState().primersById];
  let prevEntries = prevMaps[0];
  return store.subscribe((s) => {
    const next = [s.libraryEntries, s.projects, s.primersById];
    if (prevMaps[0] === next[0] && prevMaps[1] === next[1] && prevMaps[2] === next[2]) return;
    const entriesChanged = prevEntries !== next[0];
    const before = prevEntries;
    prevMaps = next;                 // BEFORE the bump: the bump re-enters this subscriber, and it
    prevEntries = next[0];           // must see the new refs there and stop.
    // Per-entry ages first, so a document built after this write already names the new one.
    if (entriesChanged) store.getState().bumpChangedEntries(before, next[0]);
    store.getState().bumpSearchCorpus();
  });
}

export const createSearchSessionSlice = (set) => ({
  /**
   * A monotonic counter of the searchable corpus. A confirmed session is only reusable while this
   * has not moved — that is the whole difference between «Back shows your search» and «Back shows
   * a search of a library that no longer exists».
   */
  searchCorpusGeneration: 0,

  bumpSearchCorpus: () => set((state) => {
    state.searchCorpusGeneration = (state.searchCorpusGeneration || 0) + 1;
  }),

  /**
   * entryId → a monotonic age of THAT molecule's saved document.
   *
   * `version` alone cannot carry the jump's stale guard: it is bumped by an explicit save, while a
   * topology flip and an annotation edit change what the coordinates mean without touching it. The
   * age is bumped by the WRITE — immer replaces the entry object on any change beneath it, so
   * comparing references catches every one and never reads a base. A coordinate measured at one age
   * is refused at any other.
   *
   * Cost, stated honestly: detecting THAT the library changed is O(1) (three map references), but
   * finding WHICH entries changed walks the map, so a library write is O(entries) — cheap next to the
   * write itself, and paid only on writes, never on a render or a keystroke.
   *
   * The counter is a TOMBSTONE: an id that leaves the library keeps its age, and gains one for the
   * departure. Deleting it would restart a re-used id at 1, and `v1#g1` is exactly the epoch some
   * parked result from the FORMER occupant of that id may still be carrying — an import that reuses
   * an id (a re-imported .bodge, a restored backup) would then have a stranger's coordinates look
   * freshly measured. Monotonic-forever costs one integer per id ever seen in the session, which is
   * the cheapest thing in this file.
   */
  entryGenerations: {},

  /** Age exactly the entries whose object identity moved between two library maps. */
  bumpChangedEntries: (before, after) => set((state) => {
    const prev = before || {};
    const next = after || {};
    if (!state.entryGenerations) state.entryGenerations = {};
    const age = (id) => {
      const g = state.entryGenerations[id];
      state.entryGenerations[id] = (Number.isSafeInteger(g) && g >= 0 ? g : 0) + 1;
    };
    for (const id of Object.keys(next)) if (prev[id] !== next[id]) age(id);
    // A departure is a change too, and the age it leaves behind is what makes an id safe to reuse.
    for (const id of Object.keys(prev)) if (!(id in next)) age(id);
  }),

  /**
   * The frame to come back to, or null when there is nothing to return to. Captured with the
   * navigation that leaves the list — never for a navigation that did not happen.
   */
  searchReturnFrame: null,

  /**
   * The frame is the WHOLE search as it stood, not a query string plus hope.
   *
   * `query` alone is a reconstruction: re-parsing it rebuilds the mode and the chips, but a resolved
   * `in:<project>` filter carries a projectId the canonical text cannot express, and a session's
   * verdict — «not verified», which providers failed, whether it was blocked — is not in the text at
   * all. Restoring from text therefore hands back a search that LOOKS like the one that was left and
   * quietly drops the warnings attached to it. So the structured query state and the session verdict
   * travel too. All of it is plain data: no worker, no promise, no callback, no DOM.
   *
   * @param {{query:string, queryState:Object|null, session:Object|null, rows:Array,
   *   activeKey:string|null, scrollTop:number, generation:number, entryId:string}} frame
   */
  captureSearchReturn: (frame) => set((state) => {
    if (!frame || typeof frame !== 'object' || !frame.entryId) { state.searchReturnFrame = null; return; }
    const s = frame.session && typeof frame.session === 'object' ? frame.session : null;
    state.searchReturnFrame = {
      query: typeof frame.query === 'string' ? frame.query : '',
      // The structured state (mode, filters with their resolved values, draft) — restored verbatim.
      queryState: frame.queryState && typeof frame.queryState === 'object' ? frame.queryState : null,
      // What the session CONCLUDED. Normalised here so the restore cannot resurrect a shape the
      // presentation layer does not expect.
      session: s ? {
        phase: typeof s.phase === 'string' ? s.phase : 'final',
        incomplete: !!s.incomplete,
        incompleteDims: Array.isArray(s.incompleteDims) ? s.incompleteDims : [],
        providerFailures: Array.isArray(s.providerFailures) ? s.providerFailures : [],
        blocked: !!s.blocked,
        requiresAlignment: s.requiresAlignment || null,
      } : null,
      rows: Array.isArray(frame.rows) ? frame.rows : [],
      activeKey: frame.activeKey ?? null,
      scrollTop: Number.isFinite(frame.scrollTop) && frame.scrollTop > 0 ? frame.scrollTop : 0,
      // The corpus the rows describe. Compared on the way back; never trusted blindly.
      generation: Number.isSafeInteger(frame.generation) ? frame.generation : -1,
      entryId: frame.entryId,
    };
  }),

  clearSearchReturn: () => set((state) => { state.searchReturnFrame = null; }),

  /**
   * entryId → a MONOTONIC counter of the transient edit buffer, the second half of the document
   * identity `displayedDocEpoch` builds (the first is the saved molecule's own).
   *
   * It exists because the buffer cannot name itself cheaply. The previous token was the edit-log
   * length plus the buffer length, and both stand still for the operations a biologist performs most:
   * a same-length substitution moves neither; an undo rewrites the buffer without growing the log
   * (`restore()` replaces it wholesale) and `mergeCorrection` collapses consecutive corrections into
   * one record; a topology flip changes which loci exist at all and was not in the token to begin
   * with. Two different documents therefore answered with one identity, and a locus measured on the
   * first was applied to the second with nothing to catch it. Hashing the bases would close that, but
   * not at a megabase on every keystroke.
   *
   * So the counter is bumped by the WRITE, not derived from the result of the write: O(1), never
   * reads a base, and — being monotonic — it can never hand back a value that an older parked jump
   * is still carrying, not even after an undo that restores the buffer byte-for-byte.
   */
  bufferGenerations: {},

  /**
   * Advance one molecule's buffer generation. Called from the SINGLE point where a transient
   * `editedSequence` / `editedTopology` change is applied (LibraryWorkspace's `onUpdateEdits`).
   * Per-entry: editing one molecule must not age another's parked jump.
   */
  bumpBufferGeneration: (entryId) => set((state) => {
    if (!entryId) return;
    if (!state.bufferGenerations) state.bufferGenerations = {};
    const prev = state.bufferGenerations[entryId];
    // A non-integer (never written by the app; possible from a rehydrated or hand-edited value)
    // restarts at 1 rather than producing NaN — forward, never backwards.
    state.bufferGenerations[entryId] = (Number.isSafeInteger(prev) && prev >= 0 ? prev : 0) + 1;
  }),

  /**
   * P3 — cross-mount «jump to a sequence occurrence» request. The inspector's caret is LOCAL state
   * that resets when the entry switches, so a jump fired from the search bar (which selects a
   * DIFFERENT entry first) cannot be applied synchronously; it is parked here and drained once the
   * target entry mounts. `revision` + `docEpoch` say WHICH document the coordinates were measured
   * on — the consumer refuses to apply them to anything else.
   */
  navRequest: null,

  /**
   * Park a jump. `target` carries `segments[]` (0-based half-open), the ±1 selection `strand`, the
   * canonical `strandRaw` (so `both` survives), `wrapsOrigin`, `identityBps` for the overlay bucket,
   * and the identity of the document it was measured on (`revision` + `docEpoch`).
   */
  requestSequenceNav: (entryId, target) => set((state) => {
    if (!entryId || !target) { state.navRequest = null; return; }
    const strand = target.strand === -1 || target.strand === '-' ? -1 : 1;
    const strandRaw = target.strandRaw === 'both' ? 'both' : (strand === -1 ? '-' : '+');
    const bps = target.identityBps;
    state.navRequest = {
      entryId,
      segments: Array.isArray(target.segments) ? target.segments : [],
      caret: target.caret || null,
      strand,
      strandRaw,
      wrapsOrigin: !!target.wrapsOrigin,
      identityBps: Number.isSafeInteger(bps) && bps >= 0 && bps <= 10000 ? bps : null,
      revision: target.revision ?? null,
      docEpoch: typeof target.docEpoch === 'string' ? target.docEpoch : null,
      kind: target.kind || 'sequence',
      status: 'pending',
    };
  }),

  /** Ack — completes / fails / cancels a nav request (all just clear the channel). */
  clearSequenceNav: () => set((state) => { state.navRequest = null; }),
});

export default createSearchSessionSlice;
