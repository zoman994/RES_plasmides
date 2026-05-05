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
 * back button) and renders the body directly into the tab. The
 * onApplyAnnotatorResults callback is piped straight through from
 * SingleInspector — same dedup pipeline (applyAnnotationEdit with
 * `create-batch`) that the modal Annotator uses, so accepted
 * regions land in editedAnnotations consistently.
 */
export default function AnnotationsTab({
  sequence = '',
  annotations = [],
  fileName,
  onApplyAnnotatorResults,
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
      />
    </div>
  );
}
