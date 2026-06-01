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
  topology,
  name,
  fileKey,
  // Entry id of the currently rendered library record. Used to scope
  // the global search-hits store-slot — overlay rects appear only
  // when the popover ran against THIS entry.
  entryId,
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
  // PCR viewer (V74) — adds «Прямой/Обратный праймер» into the shared
  // right-click selection menu. Library/Importer leave it undefined →
  // SequenceView omits the items (same gating as onBlastSelection).
  onWritePrimer,
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
  // SPEC_COMMON_FEATURES DEC-CF-05 — «Add to common features» (consumer-gated
  // pass-through). Library inspector / ContainerEditor / Importer pass these;
  // Assembly / PCR / Annotator-preview leave them undefined → no menu item.
  onPromoteToCommon,
  checkCommonDuplicate,
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
  const overlayHits = (searchHitsState?.entryId && searchHitsState.entryId === entryId)
    ? (searchHitsState.hits || EMPTY_HITS)
    : EMPTY_HITS;

  // Bug-rush #22 (04.05.2026 evening): the sticky «Sequence · 10 444
  // bp · READ-ONLY» strip was visually heavy and redundant — the same
  // numbers + the ⚙ gear now live in SingleInspector's title row, the
  // tab panel renders only the SequenceView itself. State + settings
  // popover hoisted out of this file.
  const showReadOnlyBanner = !editable && isReadOnlyZone;
  return (
    <div data-testid="importer-tab-panel-sequence" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, position: 'relative' }}>
      {showReadOnlyBanner && (
        <div
          data-testid="sequence-readonly-banner"
          style={{
            padding: '6px 16px',
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >🔒 Просмотр read-only. Для редактирования откройте в Container Window или создайте manual-edit ветку.</div>
      )}
      <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <SequenceView
          ref={sequenceViewRef}
          fragments={fragments}
          circular={topology === 'circular'}
          readOnly
          caretPos={caretPos}
          caretAnchor={caretAnchor}
          selectionMode={selectionMode}
          selectionStrand={selectionStrand}
          onCaretChange={onCaretChange}
          onSelectRange={onSelectRange}
          onAnnotationEdit={onAnnotationEdit}
          onOpenAnnotator={onOpenAnnotator}
          onOpenFeatureEditor={onOpenFeatureEditor}
          editable={editable}
          onSequenceEdit={onSequenceEdit}
          searchHits={overlayHits}
          primers={primers}
          onRestrictionClick={onRestrictionClick}
          restrictionHighlightKey={restrictionHighlightKey}
          onWritePrimer={onWritePrimer}
          onDeletePrimer={onDeletePrimer}
          onCreatePiece={onCreatePiece}
          showSelectionTm={showSelectionTm}
          coloredZones={coloredZones}
          pieceZones={pieceZones}
          onZoneClick={onZoneClick}
          onZoneHover={onZoneHover}
          outOfRangeMask={outOfRangeMask}
          onPromoteToCommon={onPromoteToCommon}
          checkCommonDuplicate={checkCommonDuplicate}
        />
      </div>
    </div>
  );
}
