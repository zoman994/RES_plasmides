import { useEffect, useMemo, useRef } from 'react';
import SequenceView from '../../../SequenceView';
import { useStore } from '../../../../store';
// Settings popover trigger + state moved to SingleInspector (bug-rush #22).

/**
 * SequenceTab — read-only SequenceView wrap (M-B.2 K4).
 *
 * Lazy-mounted: parent SingleInspector renders this only when
 * `activeTab === 'sequence'`. On switch back to overview the entire
 * SequenceView (10K+ DOM nodes for a 5 kb circular plasmid) unmounts
 * — that's the V49 50-sec hang fix (default open never builds the heavy
 * tree).
 *
 * `onAddCustomPrimer` is intentionally omitted (read-only).
 *
 * Sprint M-B.3 K8 — settings popover moved into a ⚙ button in the
 * sticky header.
 *
 * Importer-merge-tabs (04.05.2026): the dedicated «Аннотации» tab was
 * dropped — annotation-editing UI moves to a future Annotator module
 * («не смешивай»).
 *
 * Layout reshuffles (same evening):
 *   - LinearFeatureBar «колбаса» moved UP to the SingleInspector level
 *     (always visible, regardless of active tab). Click on a feature
 *     in the bar lands here as a `pendingScroll` prop — useEffect
 *     calls `sequenceViewRef.scrollToPosition(...)` and clears the
 *     queue back to null via `onPendingScrollHandled`.
 *   - Origin offset control moved BACK to MetaColumn under topology
 *     («эту панель на право, под топологию»). SequenceTab now stays
 *     viewer-only — picking a start point is metadata, sits with the
 *     other meta cards on the right rail.
 */
const EMPTY_HITS = [];

export default function SequenceTab({
  sequence,
  annotations = [],
  displayFeatures = null,
  topology,
  name,
  fileKey,
  // Terminal sticky-end staircase (Игорь 22.06): { left, right } from
  // terminalStagger(segment). Pass-through to SequenceView. Null → no staircase.
  terminalStagger = null,
  // RC-CLOSE-GATE — ring-closing junction for a circular assembly. Pass-through to
  // SequenceView → SegmentZonesOverlay (closure verdict at the terminus). Null → none.
  closureSeam = null,
  // Entry id of the currently rendered library record. Used to scope
  // the global search-hits store-slot — overlay rects appear only
  // when the popover ran against THIS entry.
  entryId,
  // U5-A — the GLOBAL-search jump's own highlight (canonical occurrences), owned by the inspector's
  // navigation consumer, NOT by the Ctrl+F `searchHits` slice. Merged with it below.
  navHits = EMPTY_HITS,
  pendingScroll,
  onPendingScrollHandled,
  caretPos,
  caretAnchor,
  selectionMode,
  selectionStrand,
  onCaretChange,
  onSelectRange,
  onAnnotationEdit,
  onOpenAnnotator,
  // V181 / UX-2 — id of the feature selected on the Overview map / list; the
  // matching annotation row highlights in the sequence after navigation.
  selectedRegionId = null,
  // Clicking a feature in the sequence sets the shared selection (sync back).
  onAnnotationClick,
  // Sprint M-X.3 follow-up — dblclick on a feature opens the
  // FeatureEditorModal (rename / type / coords / split / merge /
  // delete). Wired by SingleInspector.
  onOpenFeatureEditor,
  // M-X.6 K2 — char-apply gate (DEC-MX6-02). Pass-through to SequenceView.
  editable = false,
  onSequenceEdit,
  // M-X.7a v2 K3 — banner only when read-only `.bodge` zone (DEC-MX7A-V2-05).
  // Loose / active_bodge / lab_pool render no banner; their edit story
  // lives in the action-row + DAG operations.
  isReadOnlyZone = false,
  // 12.05.2026 — skeleton container editor adds clickable RE sites
  // в SequenceView. Library/Importer не передают → display-only path.
  onRestrictionClick,
  restrictionHighlightKey,
  // RS-PICK4 — opt-in enzyme allow-list (assembly picker). Pass-through to
  // SequenceView so the набор/picked/unique selection filters the sequence's RE
  // sites. undefined → store-driven (Library/Importer unchanged).
  reEnzymesFilter,
  // PCR viewer (V74) — adds «Прямой/Обратный праймер» into the shared
  // right-click selection menu. Library/Importer leave it undefined →
  // SequenceView omits the items (same gating as onBlastSelection).
  onWritePrimer,
  // PRIMER-LIVE-1 — pass-through only: personal-inventory records for the
  // «already in the lab» answer, and the single action for two chosen
  // landings. Undefined ⇒ the viewer renders no extra affordance.
  labPrimers,
  onReuseLabPrimer,
  onCreatePcrProduct,
  // Assembly-only amino-acid mutation entry point. Undefined everywhere else
  // keeps the AA track display-only.
  onAAClick,
  // ANN-0M root D — which molecule and which version of it is on screen. The
  // viewer cannot confirm a declared landing without being told.
  documentHash,
  // Assembly editor — Del on a selected primer deletes it (consumer-gated
  // pass-through, same shape as onWritePrimer). Library/Importer leave it
  // undefined → SequenceView swallows Del on a selected primer (read-only).
  onDeletePrimer,
  // T5 — piece authoring (same consumer-gated pass-through as
  // onWritePrimer; Container Editor passes it, others don't).
  onCreatePiece,
  // PCR viewer (V76) — near-cursor annealing-Tm readout on selection.
  showSelectionTm = false,
  // Skeleton editor passes derived primers (origin-commits +
  // indexOf-match). Library/Importer leaves undefined → SequenceView
  // default empty.
  primers,
  // A2 / G2 — assembly editor coloured segment backdrop + zone
  // click/hover. Library/Importer/PCR leave undefined → no zones.
  coloredZones,
  // T6 K13 — 4-tier vocabulary alias; forwarded to SequenceView which
  // resolves `pieceZones ?? coloredZones` (back-compat, R-T6-6).
  pieceZones,
  onZoneClick,
  onZoneHover,
  // V87 — opt-in out-of-range mask for the RangePickerModal viewer
  // ({start,end}). Library/Importer leave it undefined → no overlay.
  outOfRangeMask,
  // Backbone invert (assembly picker): highlight the COMPLEMENT of the current
  // selection (the wrap-around backbone) instead of the selection itself.
  // Pass-through to SequenceView → SelectionOverlay. undefined → normal selection.
  inverted,
  // SPEC_COMMON_FEATURES DEC-CF-05 — «Add to common features» (consumer-gated
  // pass-through). Library inspector / ContainerEditor / Importer pass these;
  // Assembly / PCR / Annotator-preview leave them undefined → no menu item.
  onPromoteToCommon,
  checkCommonDuplicate,
  // FEAT-EXTRACT — «извлечь фичу → Library entry» (consumer-gated pass-through).
  onExtractFeature,
}) {
  const sequenceViewRef = useRef(null);

  // Pending-scroll effect: SingleInspector queues a `{pos, tick}`
  // when biolog clicks a feature on the top-level LinearFeatureBar
  // («колбаса»). The bar lives at SingleInspector level now — when
  // the click happens from the Overview tab, SingleInspector
  // auto-switches to Sequence first, then this effect runs once
  // SequenceView's ref is ready. `tick` ensures repeat clicks on
  // the same feature still trigger a scroll.
  useEffect(() => {
    if (!pendingScroll) return;
    const ref = sequenceViewRef.current;
    if (!ref || typeof ref.scrollToPosition !== 'function') return;
    // `instant: true` comes from the LinearFeatureBar drag-scrub —
    // smooth animation can't keep up with pointermove cadence so the
    // viewer would always be a few hundred ms behind the cursor.
    // 'auto' makes scroll snap each frame; settle (click / pointer
    // release) reverts to 'smooth' for a polished landing.
    const behavior = pendingScroll.instant ? 'auto' : 'smooth';
    ref.scrollToPosition(Number(pendingScroll.pos) || 0, { behavior });
    onPendingScrollHandled?.();
  }, [pendingScroll, onPendingScrollHandled]);
  const fragment = useMemo(() => ({
    id: 'importer-current',
    name: name || 'imported',
    sequence: sequence || '',
    annotations,
    type: topology === 'circular' ? 'plasmid' : 'misc_feature',
    strand: 1,
  }), [sequence, annotations, topology, name]);
  // Memoize the fragments array too — `<SequenceView fragments={[fragment]}>`
  // would create a new array literal on every SequenceTab render
  // (every pendingScroll change = every keystroke from the SequenceView
  // caret nav). That fresh reference invalidates SequenceView's
  // `confidentFeatures` / `predictedRegions` / `orfRanges` / `lines`
  // useMemos which depend on `[fragments]`, causing buildFeatureMap +
  // runPredictors + detectORFRanges to re-run per keystroke. On a
  // typical 5-10 kb plasmid that's 10s of ms per arrow-key press —
  // exactly the «прям беда» lag biolog reported 04.05.2026 evening.
  // With the array memoized, those useMemos stay cached and the only
  // work per keystroke is the cheap CaretOverlay DOM probe.
  const fragments = useMemo(() => [fragment], [fragment]);
  const length = (sequence || '').length;

  // Search-hits overlay (TD-SEARCH-OVERLAY-RECTS). Read store and
  // pass to SequenceView only when the hits belong to the current
  // entry — otherwise we'd smear stale rects after switching entry.
  const searchHitsState = useStore((s) => s.searchHits);
  const ctrlFHits = (searchHitsState?.entryId && searchHitsState.entryId === entryId)
    ? (searchHitsState.hits || EMPTY_HITS)
    : EMPTY_HITS;
  // U5-A — TWO owners paint here and neither may erase the other: the `searchHits` slice belongs to
  // the in-molecule Ctrl+F find-all, `navHits` is the locus a GLOBAL search jump landed on (owned by
  // the inspector's navigation consumer, because a caret cannot express an origin wrap or a
  // `both`-strand hit). This seam MERGES them; it never chooses.
  const overlayHits = useMemo(
    () => (navHits && navHits.length ? [...ctrlFHits, ...navHits] : ctrlFHits),
    [ctrlFHits, navHits],
  );

  // 17.06.2026 (Игорь) — read-only banner removed; the Library sequence
  // is editable by default. The ⚙ gear + length/topology live in the
  // title row; this panel renders the SequenceView itself.
  return (
    <div data-testid="importer-tab-panel-sequence" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, position: 'relative' }}>
      <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <SequenceView
          ref={sequenceViewRef}
          fragments={fragments}
          displayFeatures={displayFeatures}
          circular={topology === 'circular'}
          terminalStagger={terminalStagger}
          closureSeam={closureSeam}
          readOnly
          caretPos={caretPos}
          caretAnchor={caretAnchor}
          selectionMode={selectionMode}
          selectionStrand={selectionStrand}
          onCaretChange={onCaretChange}
          onSelectRange={onSelectRange}
          onAnnotationEdit={onAnnotationEdit}
          onOpenAnnotator={onOpenAnnotator}
          selectedRegionId={selectedRegionId}
          onAnnotationClick={onAnnotationClick}
          onOpenFeatureEditor={onOpenFeatureEditor}
          editable={editable}
          onSequenceEdit={onSequenceEdit}
          searchHits={overlayHits}
          primers={primers}
          onRestrictionClick={onRestrictionClick}
          restrictionHighlightKey={restrictionHighlightKey}
          reEnzymesFilter={reEnzymesFilter}
          onWritePrimer={onWritePrimer}
          onDeletePrimer={onDeletePrimer}
          labPrimers={labPrimers}
          onReuseLabPrimer={onReuseLabPrimer}
          onCreatePcrProduct={onCreatePcrProduct}
          onAAClick={onAAClick}
          entryId={entryId}
          documentHash={documentHash}
          onCreatePiece={onCreatePiece}
          showSelectionTm={showSelectionTm}
          coloredZones={coloredZones}
          pieceZones={pieceZones}
          onZoneClick={onZoneClick}
          onZoneHover={onZoneHover}
          outOfRangeMask={outOfRangeMask}
          inverted={inverted}
          onPromoteToCommon={onPromoteToCommon}
          onExtractFeature={onExtractFeature}
          checkCommonDuplicate={checkCommonDuplicate}
        />
      </div>
    </div>
  );
}
