/**
 * useSequenceNavConsumer — the second stage of the global-search jump (P3 / U5-A), extracted from
 * LibrarySingleInspector (which reached 41.58 / 40 KB hard when this grew).
 *
 * The caret in the inspector is LOCAL hook state that resets when the entry switches, so a jump fired
 * from the search bar — which selects a DIFFERENT entry first — cannot be applied synchronously. It is
 * parked in the store and drained HERE, once the target molecule is mounted.
 *
 * WHO OWNS WHAT (the thing this hook got wrong once, so it is spelled out):
 *   • `uiSlice.searchHits` belongs to the IN-MOLECULE Ctrl+F search and to nothing else. A global jump
 *     never writes there. It used to, and that was not sharing a channel but destroying another
 *     feature's state: the biologist's find-all list vanished, closing Ctrl+F wiped the jump
 *     highlight, and a later single-range jump left the old wrap bands painted beside the new locus —
 *     a hit shown where the search found none.
 *   • the GLOBAL jump highlight is owned HERE, in local state keyed by entry + revision. It is
 *     replaced by the next global jump, dropped when the molecule or its revision changes, and dies
 *     with the component. Nothing about it lives in the near-soft `uiSlice`.
 * SequenceTab merges the two for the overlay; neither owner can erase the other.
 *
 * WHEN THE OVERLAY IS NEEDED. The selection is ONE contiguous range on ONE strand, so it cannot
 * express two things:
 *   • an ORIGIN-CROSSING locus (two segments) — selecting the first would show half a hit;
 *   • a `both`-strand locus (a palindrome) — the caret paints the top strand and hides the bottom.
 * Either case goes to the multi-band overlay. A plain single-strand range is fully expressible by the
 * selection, and then no band is drawn at all.
 *
 * A revision or epoch that cannot be VERIFIED against the document on screen = the jump is dropped,
 * never applied to coordinates it was not measured against. Fail-closed: an unverifiable request
 * changes nothing at all — no caret, no scroll, no tab switch, no band — and is acked.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../../../../store';
import { entryRevision, displayedDocEpoch } from '../../../../lib/search-document-adapters';

/** Stable empty array — a fresh literal would invalidate the overlay's memos on every render. */
const NO_HITS = [];

/** The physical segments of a parked request, minus anything malformed. */
function validSegments(navRequest) {
  return (Array.isArray(navRequest?.segments) ? navRequest.segments : []).filter(
    (s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
  );
}

/**
 * The overlay bands a jump needs, or `null` when the selection alone says it all. Pure.
 * A caret is ONE contiguous range on ONE strand, so it cannot express an origin wrap (two segments)
 * or a `both`-strand hit (a palindrome) — those, and only those, need bands.
 */
function overlayHitsFor(navRequest) {
  const segments = validSegments(navRequest);
  if (!segments.length) return null;
  const strandRaw = navRequest.strandRaw || (navRequest.strand === -1 ? '-' : '+');
  if (segments.length === 1 && strandRaw !== 'both') return null;
  return [{
    location: { segments, strand: strandRaw, wrapsOrigin: !!navRequest.wrapsOrigin },
    metrics: { identityBps: navRequest.identityBps },
  }];
}

export function useSequenceNavConsumer({
  item, edits, activeTab, onActiveTabChange, onSelectRangeFromView, scrollToPos,
}) {
  const navRequest = useStore((s) => s.navRequest);
  const clearSequenceNav = useStore((s) => s.clearSequenceNav);
  const entryId = item?.id;
  const revision = entryRevision(item);
  // WHICH document the viewer is actually showing: the saved molecule, or the transient edit buffer.
  // O(1) — the saved version plus the buffer's monotonic generation, never the sequence content.
  const bufferGeneration = useStore((s) => (entryId ? s.bufferGenerations?.[entryId] : undefined));
  const entryGeneration = useStore((s) => (entryId ? s.entryGenerations?.[entryId] : undefined));
  // Two documents can be on screen: the saved molecule (version + its per-entry age) or a transient
  // buffer forked from it. Which one, and its name, is decided by the SAME function every producer
  // calls — `displayedDocEpoch`. This side must never re-implement the equality it is checking.
  const displayedEpoch = displayedDocEpoch(item, edits, { entry: entryGeneration, buffer: bufferGeneration });

  // A request is APPLICABLE only when every fact it carries can be CHECKED against the document on
  // screen and agrees with it: this molecule, this revision, this epoch. Anything less is dropped.
  //
  // FAIL-CLOSED, deliberately. The previous rule accepted a request whose `docEpoch` was null, and
  // its revision clause passed whenever EITHER side was null — so a molecule carrying no revision
  // (both sides null) had no stale guard at all, and coordinates from any document were applied to
  // it. An unverifiable jump is not a safe jump: it is a caret placed on bases nobody proved were
  // the ones the search measured. Refusing costs the user a click; applying moves them silently to
  // the wrong locus, which is worse the more it looks like it worked.
  const applicable = !!navRequest && !!entryId && navRequest.entryId === entryId
    && navRequest.docEpoch != null && navRequest.docEpoch === displayedEpoch
    && navRequest.revision != null && revision != null && navRequest.revision === revision;

  // The jump's OWN highlight, folded in during RENDER — the React-sanctioned «adjust state on a prop
  // change» pattern (AGENTS.md §244). Not in the effect: setState there cascades renders, and the
  // effect below is for side effects only (select, scroll, tab, ack).
  //
  // The key carries the DISPLAYED document, so a transient edit drops the bands: after an indel the
  // old coordinates point at bases that have moved, and a highlight left behind would mark a locus
  // that is no longer there.
  const key = `${entryId ?? ''}@${revision ?? ''}#${displayedEpoch}`;
  const [applied, setApplied] = useState({ key, request: null, hits: NO_HITS });
  if (applied.key !== key) {
    // A different molecule (or revision) — the previous jump's bands describe coordinates that are
    // no longer on screen.
    setApplied({ key, request: null, hits: NO_HITS });
  } else if (applicable && navRequest !== applied.request) {
    // Set OR clear: the previous jump's bands must not survive beside a new locus.
    setApplied({ key, request: navRequest, hits: overlayHitsFor(navRequest) || NO_HITS });
  }

  useEffect(() => {
    if (!applicable) {
      // A request aimed at this entry but measured against another revision is acked, not applied.
      if (navRequest && entryId && navRequest.entryId === entryId) clearSequenceNav();
      return;
    }
    const first = validSegments(navRequest)[0];
    const caret = navRequest.caret || (first ? { start: first.start, end: first.end } : null);
    if (caret && Number.isFinite(caret.start) && Number.isFinite(caret.end)) {
      const strand = navRequest.strand === -1 ? -1 : 1;
      // The overlay and the selection both live on the Sequence tab. Leaving the user anywhere else —
      // Annotations included — scrolls a surface that cannot show the locus and hides the wrap
      // segments in an unmounted tab.
      if (activeTab !== 'sequence') onActiveTabChange?.('sequence');
      onSelectRangeFromView(caret.start, caret.end, 'dna', strand); // the single selected range
      scrollToPos(caret.start); // force-center regardless of scrollOnFeatureClick
    }
    clearSequenceNav();
  }, [
    applicable, navRequest, entryId, activeTab, onActiveTabChange,
    onSelectRangeFromView, scrollToPos, clearSequenceNav,
  ]);

  return { navHits: applied.key === key ? applied.hits : NO_HITS };
}

export default useSequenceNavConsumer;
