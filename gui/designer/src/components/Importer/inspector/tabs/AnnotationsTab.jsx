import { useCallback } from 'react';
import AnnotationEditor from '../../../AnnotationEditor';
import LinearFeatureBar from './LinearFeatureBar';
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
      {/*
        Linear feature strip on top — replaces AnnotationEditor's built-in
        bar (which has no leader-labels for small features). LinearFeatureBar
        adds callout-labels for ATG / 3xFLAG / SV40 NLS / RBS / small
        promoters and similar features that get drowned in the colour rect
        but stay important to read at a glance.
      */}
      <LinearFeatureBar annotations={annotations} seqLength={seqLength} />

      <div
        data-testid="importer-annotation-editor-wrap"
        className="importer-annotation-editor-wrap"
        style={{ width: '100%', minWidth: 0, flex: 1, minHeight: 0 }}
      >
        {/*
          hideBar=true here — LinearFeatureBar above replaces it.
          compact=false so the editor uses the full Inspector width with
          normal-size rows + visible action buttons.

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
          hideBar
        />
      </div>
    </div>
  );
}
