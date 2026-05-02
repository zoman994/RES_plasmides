import { useCallback } from 'react';
import AnnotationEditor from '../../../AnnotationEditor';
import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.importer;

/**
 * AnnotationsTab — full-edit AnnotationEditor wrap (M-B.2 K4).
 *
 * Lazy-mounted alongside SequenceTab — the parent renders us only when
 * `activeTab === 'annotations'`. On change we forward the new annotations
 * up via `onUpdateEdits({ editedAnnotations })` so SingleInspector picks
 * them up on next render and Confirm flow promotes them into the final
 * LibraryEntry.
 */
export default function AnnotationsTab({
  annotations = [],
  seqLength = 0,
  onUpdateEdits,
}) {
  const onChange = useCallback((next) => {
    onUpdateEdits?.({ editedAnnotations: next });
  }, [onUpdateEdits]);

  return (
    <div
      data-testid="importer-tab-panel-annotations"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{S.tabAnnotations}</span>
        <span> · </span>
        <span>{S.annotationsCount(annotations.length)}</span>
      </div>
      <div
        data-testid="importer-annotation-editor-wrap"
        className="importer-annotation-editor-wrap"
        style={{ width: '100%', minWidth: 0, flex: 1, minHeight: 0 }}
      >
        {/*
          hideBar=false → shows the linear feature «колбаса» strip (v0.5
          parity); compact=false so the editor uses the full Inspector
          width with normal-size rows + visible action buttons (was
          drowning in narrow column).

          AnnotationEditor sets `max-h-[180px]` on its scroll list — way
          too small for the Inspector's available vertical space. The CSS
          override in index.css (`.importer-annotation-editor-wrap`)
          neutralises that limit and lets the list fill whatever room the
          tab content has.
        */}
        <AnnotationEditor
          annotations={annotations}
          seqLength={seqLength}
          onChange={onChange}
          ignoreOwnColor
        />
      </div>
    </div>
  );
}
