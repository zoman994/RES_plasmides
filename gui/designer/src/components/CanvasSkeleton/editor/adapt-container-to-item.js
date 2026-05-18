/**
 * adapt-container-to-item — DEC-CANVAS-V2-EDITOR-02.
 *
 * Maps skeleton container shape → Library inspector item-shape so
 * sub-tabs (OverviewTab / SequenceTab / AnnotationsTab / HistoryTab /
 * LinearFeatureBar) + FeatureEditorModal + hooks (useFeatureEditorFlow,
 * useAnnotationUndoRedo) can be reused unchanged.
 *
 * Key conversions:
 *   - container.topology: {circular: bool} → item.topology: 'circular'|'linear'
 *     (Library uses string literal, sub-tabs check `topology === 'circular'`).
 *   - container.id → item._fileName (sub-tabs use as cache key for
 *     LinearFeatureBar measurements, scroll state).
 *   - container.id → item.id (FeatureEditorModal / undo-stack itemKey).
 *   - container.sequence / annotations / length / name — passed through.
 *   - item._libraryEntryId = null — explicitly disables manual-edit
 *     branching code paths in SequenceTab (SequenceTab only forwards
 *     onSequenceEdit when _libraryEntryId is set, see
 *     LibrarySingleInspector.jsx::onSequenceEditFromView).
 *   - item.zone = 'skeleton' — informational tag for downstream guards
 *     (e.g. read-only banner suppression). Skeleton has no readonly
 *     zone, so isReadOnlyZone is always passed false from editor.
 *
 * V2 paradigma (NOTES_CANVAS_V2_KICKOFF.md §2): placeholder containers
 * with sequence=null. Adapter returns item with empty sequence + 0
 * length — editor checks for this BEFORE passing to tabs (Q5 guard).
 */

export function buildItemFromContainer(container) {
  if (!container) {
    return {
      id: null,
      _fileName: null,
      name: '',
      sequence: '',
      annotations: [],
      topology: 'linear',
      length: 0,
      _libraryEntryId: null,
      zone: 'skeleton',
    };
  }
  const seq = container.sequence || '';
  const topologyString = container.topology?.circular ? 'circular' : 'linear';
  return {
    id: container.id,
    _fileName: container.id,
    name: container.name || '',
    sequence: seq,
    annotations: Array.isArray(container.annotations) ? container.annotations : [],
    topology: topologyString,
    length: typeof container.length === 'number' ? container.length : seq.length,
    _libraryEntryId: null,
    zone: 'skeleton',
    // Preserved fields that sub-tabs / FeatureEditorModal may read
    // opportunistically (origin display, commit history). Pass-through
    // — undefined if container doesn't have them.
    origin: container.origin,
    commits: container.commits,
  };
}

/**
 * Translate skeleton pending edits → Library `edits` shape.
 *
 * Library hooks (useAnnotationUndoRedo, useFeatureEditorFlow) read
 * `edits?.editedAnnotations` as the override source — if present,
 * they use it; otherwise fall back to `item.annotations`.
 *
 * Returns null when nothing pending, so consumers can `edits ||
 * undefined` cleanly.
 */
export function buildEditsFromPending(pending) {
  if (!pending) return null;
  const out = {};
  let hasAny = false;
  if (Array.isArray(pending.editedAnnotations)) {
    out.editedAnnotations = pending.editedAnnotations;
    hasAny = true;
  }
  if (typeof pending.editedSequence === 'string') {
    out.editedSequence = pending.editedSequence;
    hasAny = true;
  }
  if (pending.editedTopology) {
    out.editedTopology = typeof pending.editedTopology === 'string'
      ? pending.editedTopology
      : (pending.editedTopology.circular ? 'circular' : 'linear');
    hasAny = true;
  }
  if (typeof pending.editedName === 'string') {
    out.editedName = pending.editedName;
    hasAny = true;
  }
  return hasAny ? out : null;
}

/**
 * Has-pending check — used by editor for Apply / Discard button enabled
 * state. Cheap: just checks whether any of the 4 pending fields exist.
 */
export function hasPendingEdits(pending) {
  if (!pending) return false;
  return (
    Array.isArray(pending.editedAnnotations)
    || typeof pending.editedSequence === 'string'
    || pending.editedTopology != null
    || typeof pending.editedName === 'string'
  );
}
