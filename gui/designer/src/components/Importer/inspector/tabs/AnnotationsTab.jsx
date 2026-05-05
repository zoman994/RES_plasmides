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
  onApplyAnnotatorResults,
  onAnnotationEdit,
  onOpenFeatureEditor,
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
      <Annotator
        embedded
        embeddedSequenceId={fileName || 'annotations-tab'}
        sequence={sequence}
        annotations={annotations}
        onApplyAnnotatorResults={onApplyAnnotatorResults}
        onAnnotationEdit={onAnnotationEdit}
        onOpenFeatureEditor={onOpenFeatureEditor}
      />
    </div>
  );
}
