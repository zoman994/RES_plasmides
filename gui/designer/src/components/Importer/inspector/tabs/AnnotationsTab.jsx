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
  autoAnnotate = true,
  onToggleAutoAnnotate,
  onRunAutoAnnotate, // eslint-disable-line no-unused-vars -- stub state, see button below
  onOpenAnnotator,
}) {
  const onChange = useCallback((next) => {
    onUpdateEdits?.({ editedAnnotations: next });
  }, [onUpdateEdits]);

  return (
    <div
      data-testid="importer-tab-panel-annotations"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        fontSize: 11, color: 'var(--text-tertiary)',
      }}>
        <span>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{S.tabAnnotations}</span>
          <span> · </span>
          <span>{S.annotationsCount(annotations.length)}</span>
        </span>
        <span style={{ flex: 1 }} />
        {/*
          Auto-annotate is currently a stub: the manual «Запустить» button
          stays in place so the user knows where it'll live, but it's
          disabled until the new annotator (per-CDS SignalIP, smarter ORF
          scoring, less consensus noise) lands. The «при импорте» checkbox
          still flips the per-file flag — confirm flow will auto-annotate
          using the existing pipeline regardless of the stub.
        */}
        {/*
          Sprint M-X.2 K9 — replaces the disabled `actionAnnotate`
          stub. Active button opens the fullscreen Annotator with a
          full-sequence scope. Per-CDS SignalIP / smarter ORF /
          BLAST integration is the actual annotator now.
        */}
        <button
          type="button"
          data-testid="annotations-open-annotator"
          onClick={onOpenAnnotator
            ? () => onOpenAnnotator({ kind: 'full' })
            : undefined}
          disabled={!onOpenAnnotator}
          title={STRINGS.importer.annotator.annotatorButtonHint}
          style={{
            fontSize: 11, padding: '4px 10px',
            background: onOpenAnnotator ? 'var(--accent-500, #f97316)' : 'transparent',
            color: onOpenAnnotator ? '#fff' : 'var(--text-tertiary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: onOpenAnnotator ? 'pointer' : 'not-allowed',
            opacity: onOpenAnnotator ? 1 : 0.7,
            fontWeight: 500,
          }}
        >{STRINGS.importer.annotator.annotatorButtonLabel}</button>
        {onToggleAutoAnnotate && (
          <label
            data-testid="annotations-auto-toggle"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={!!autoAnnotate}
              onChange={(e) => onToggleAutoAnnotate(e.target.checked)}
              style={{ accentColor: 'var(--accent-500)', cursor: 'pointer' }}
            />
            {S.tabAnnotateOnImport}
          </label>
        )}
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
