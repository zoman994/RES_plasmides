import Annotator from '../../../Annotator';

/**
 * AnnotationsTab — Sprint M-X.3 follow-up (05.05.2026).
 *
 * Biolog: «давай меню аннотатора прям во вкладке. сейчас вкладка
 * инвалид». Pre-fix this tab showed only an AnnotationEditor list
 * + a button that opened the fullscreen Annotator modal. The user
 * wanted the whole Annotator UI (linear/circular map + 3-level
 * progression panel + auto-run L1) inline in the tab.
 *
 * The tab is now a thin wrapper around <Annotator embedded ... />.
 * Embedded mode skips the modal chrome (backdrop, centred panel,
 * back button) and renders the body directly into the tab.
 *
 * Sprint M-X.3 follow-up (05.05.2026 evening) — biolog: «надо дать
 * возможность растягивать сжимать фичи, редачить двойным кликом и
 * выдлять последовательность - а дальше уже эту последоватность
 * дать возможность бластить». The SequenceView in the embedded
 * Annotator now also accepts the same drag-edit / dbl-click / BLAST
 * callbacks the regular Sequence tab uses. SingleInspector owns the
 * heavy lifting (FeatureEditorModal mount, undo stack,
 * applyAnnotationEdit dispatch); we just forward the callbacks
 * down.
 */
export default function AnnotationsTab({
  sequence = '',
  annotations = [],
  fileName,
  // True when this tab is the user-facing active tab. SingleInspector
  // pre-warms hidden tabs (display:none) for instant switching;
  // when `active` is false, the embedded Annotator suppresses its
  // auto-open dispatch so the modal Annotator doesn't surface
  // over the actually-active Overview/Sequence tab.
  active = true,
  onApplyAnnotatorResults,
  onAnnotationEdit,
  onOpenFeatureEditor,
  // Strip-driven scroll signal — same shape SequenceTab consumes.
  // SingleInspector forwards it only when this tab is active so a
  // hidden Annotator doesn't snap-scroll on every bar drag.
  pendingScroll = null,
  onPendingScrollHandled,
  // M-X.7a v2 K3 — banner only when read-only `.bodge` zone (DEC-MX7A-V2-05).
  // For other zones, annotation editing surface stays untouched —
  // Annotator embedded continues to behave per M-X.5 baseline.
  isReadOnlyZone = false,
}) {
  return (
    <div
      data-testid="importer-tab-panel-annotations"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        flex: 1,
        minHeight: 0,
      }}
    >
      {isReadOnlyZone && (
        <div
          data-testid="annotations-readonly-banner"
          style={{
            padding: '6px 16px',
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >🔒 Просмотр read-only. Edit аннотаций — в Container Window.</div>
      )}
      <Annotator
        embedded
        embeddedActive={active}
        embeddedSequenceId={fileName || 'annotations-tab'}
        sequence={sequence}
        annotations={annotations}
        onApplyAnnotatorResults={onApplyAnnotatorResults}
        onAnnotationEdit={onAnnotationEdit}
        onOpenFeatureEditor={onOpenFeatureEditor}
        pendingScroll={pendingScroll}
        onPendingScrollHandled={onPendingScrollHandled}
      />
    </div>
  );
}
