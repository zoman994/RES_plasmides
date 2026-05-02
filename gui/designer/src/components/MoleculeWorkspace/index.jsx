import { useState, useCallback } from 'react';
import LeftPane from './LeftPane';
import RightPane from './RightPane';

/**
 * MoleculeWorkspace (M-B.1 K4, DEC-IMP-12 ⚓).
 *
 * Layout-only component: 380 px LeftPane (map + annotation editor +
 * start-point + auto-annotate toggle) + flex RightPane (sequence). It does
 * NOT know whether it's mounted inside Importer, Container Window M-D, or a
 * cross-project preview. Inversion of control: the wrapping context decides
 * which handlers to provide; absent handlers degrade panes to read-only.
 *
 * Contract (full prop list — see SPRINT_M-B.1_IMPORTER §4 DEC-IMP-12):
 *   sequence              : string                                — current sequence
 *   annotations           : Annotation[]                          — current annotations
 *   topology              : 'linear' | 'circular'
 *   ends?                 : { left, right }                       — for linear
 *   originOffset          : number                                — 0-based
 *   gaps?                 : Gap[]                                 — M-D BLAST UI; Importer ignores
 *   onAnnotationChange?   : (newAnnotations) => void              — undefined → annotations read-only
 *   onOriginRotate?       : (newOffset) => void                   — undefined → start-point hidden
 *   sequenceReadOnly      : boolean                               — Importer always true; M-D variable
 *   autoAnnotateEnabled?  : boolean
 *   onAutoAnnotateToggle? : (enabled) => void                     — undefined → toggle hidden
 *   onBlastGap?           : (gap) => void                         — M-D Container Window only
 *   name?                 : string                                — display label
 *
 * Cross-pane sync is owned here: clicking an annotation in the editor sets
 * `selectedAnnotation` which propagates to RightPane (selection banner) and
 * stays as the highlighted row in LeftPane (AnnotationEditor's selectedAnnotation
 * contract). Live scroll-to-position in SequenceMapView is M-D scope
 * (requires a programmatic scroll API the read-only viewer doesn't expose
 * yet); the banner gives the biolog the position cue without that.
 */
export default function MoleculeWorkspace({
  sequence = '',
  annotations = [],
  topology = 'linear',
  ends,
  originOffset = 0,
  gaps,
  onAnnotationChange,
  onOriginRotate,
  sequenceReadOnly = true,
  autoAnnotateEnabled,
  onAutoAnnotateToggle,
  onBlastGap,
  name = 'molecule',
}) {
  // Annotations identity-compare via the array reference is OK for K4 — both
  // `annotations` and the `onSelect` callback agree on the same object.
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);

  const onSelectAnnotation = useCallback((ann) => {
    setSelectedAnnotation(prev => {
      if (!prev || !ann) return ann || null;
      // Identity OR id-equality both deselect — AnnotationEditor / getRegions
      // can return a fresh wrapper object for region annotations that were
      // missing an id at construction time.
      if (prev === ann) return null;
      if (prev.id != null && prev.id === ann.id) return null;
      return ann;
    });
  }, []);

  return (
    <div
      data-testid="molecule-workspace"
      data-topology={topology}
      data-readonly={sequenceReadOnly ? 'true' : 'false'}
      style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <LeftPane
        sequence={sequence}
        annotations={annotations}
        topology={topology}
        originOffset={originOffset}
        onAnnotationChange={onAnnotationChange}
        onOriginRotate={onOriginRotate}
        autoAnnotateEnabled={autoAnnotateEnabled}
        onAutoAnnotateToggle={onAutoAnnotateToggle}
        selectedAnnotation={selectedAnnotation}
        onSelectAnnotation={onSelectAnnotation}
      />
      <RightPane
        sequence={sequence}
        annotations={annotations}
        topology={topology}
        name={name}
        selectedAnnotation={selectedAnnotation}
        sequenceReadOnly={sequenceReadOnly}
      />
    </div>
  );
}
