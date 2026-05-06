import { useEffect, useMemo, useRef } from 'react';
import SequenceView from '../../../SequenceView';
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
export default function SequenceTab({
  sequence,
  annotations = [],
  topology,
  name,
  fileKey,
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

  // Bug-rush #22 (04.05.2026 evening): the sticky «Sequence · 10 444
  // bp · READ-ONLY» strip was visually heavy and redundant — the same
  // numbers + the ⚙ gear now live in SingleInspector's title row, the
  // tab panel renders only the SequenceView itself. State + settings
  // popover hoisted out of this file.
  return (
    <div data-testid="importer-tab-panel-sequence" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, position: 'relative' }}>
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
        />
      </div>
    </div>
  );
}
