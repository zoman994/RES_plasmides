# Intended behavior — Library / Annotator / inspector (how it should REALLY work)

Distilled from Igor's hands-on testing + the persistence audit (2026-06-14). This is the
contract for how these surfaces must behave, with the rationale behind each rule.

## Dual-host inspector architecture (the key gotcha)
`LibrarySingleInspector` is mounted by TWO hosts that wire edits differently:
- **Importer host** (`components/Library/index.jsx` via `hooks/useLibraryState.js`):
  `updateEdits` has a silent write-through; its items carry `item._libraryEntryId`.
- **LibraryWorkspace host** (`components/Library/LibraryWorkspace.jsx`): the UI Igor
  actually uses. It builds `item = {...rawEntry, ...payload, _libraryEntryId: selectedId}`.
  The library entry IS the source of truth here; per-entry React state is transient.

Rule: in the workspace, EVERY user edit must persist to the entry (store +
IndexedDB via `putLibraryEntry`), because transient `perEntryState` is lost on
unmount/reload/entry-switch. Persist keyed on `selectedId`, NOT by reading
`item._libraryEntryId` for the workspace's own write-throughs.

## Annotation edits must persist (fix 4548025)
Creating/editing/deleting an annotation in the embedded Annotator OR via FeatureEditorModal
must write through to `entry.payload.annotations`. Mechanism: `onUpdateEdits({editedAnnotations})`
→ `writeLibraryEntryAnnotations(selectedId, arr)` (silent overwrite, no version bump,
DEC-LIB-11 hybrid). Symptom before fix: "создал ORF в аннотаторе → после выхода пропадает."

## Sequence edits must persist (fix 005beb4)
Character-level sequence editing in the workspace requires `item._libraryEntryId` so
`onSequenceEditFromView` reaches `applySequenceEditOnLibraryEntry`, and `useManualEditBranching`
arms. Editing a parent entry's sequence forks a **child manual_edit variant** (bio-invariant:
never overwrite a Part on mutation, create a child). Side effect handled: the Importer-only
explicit Save buttons are suppressed in the workspace via `showSaveActions={false}` — they
would misleadingly flag «несохранено» right after a silent save.

## Annotator must allow selection + feature delete (feat 1717c83)
The embedded Annotator preview must support: drag-select a sequence range; click a CONFIRMED
feature to select its whole range (so Del removes it, E edits it); predicted (ghost) clicks
open the drill-in (Accept/Reject/BLAST). Mechanism: PreviewTab owns selection via the shared
`useSequenceSelection` hook and spreads `viewerProps` into SequenceView. Sequence nucleotide
typing stays OFF in the annotator (annotation work, not base editing). SequenceView selection
is fully controlled — without caretPos/anchor + onCaretChange/onSelectRange, range-select and
Del are dead.

## Deferred (rationale, not forgotten)
- Tags + topology editing have NO UI in the LibraryWorkspace (editors live only in the
  Importer's MetaColumn). Not data-loss (nothing to lose), but a feature gap. To add: mount
  the UI + write-through (`updateLibraryEntryTags`; a new topology writer) keyed on selectedId.
- L8 manual assembly-primer coord-shift; L9 stale-DAG badge; L10 mutagenesis engine unification
  (mitigated by H2). Diminishing-returns tail.
