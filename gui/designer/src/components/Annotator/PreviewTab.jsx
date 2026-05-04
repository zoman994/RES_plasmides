/**
 * Annotator/PreviewTab — Sprint M-X.3 K4.
 *
 * Right-pane body of the Annotator's «Preview» tab. Mounts the same
 * SequenceView the Importer's SequenceTab uses, but with a merged
 * fragment whose annotations array is `[...confirmed, ...predicted]`.
 *
 * AnnotationTrack already differentiates predicted features
 * (`region.predicted === true`) with dashed strokes + transparent
 * fill + italic tilde-prefixed labels (DEC-PRED-05). So «ghost
 * rendering» is automatic — the only extra we wire here is:
 *   1. Threshold filtering — drop predicted regions whose
 *      `confidence < state.annotator.threshold` so the Preview tab
 *      stays in sync with the slider in the Annotator header.
 *   2. Single-click → ghost drill-in panel (Accept / Reject /
 *      Run BLAST / Re-run predictors). Click on a confirmed
 *      annotation is a no-op for the panel; the SequenceView still
 *      handles selection / scroll for those.
 *
 * The drill-in panel sits as an absolutely-positioned overlay so
 * SequenceView can keep its full width — the panel is a 280 px
 * slide-over on the right.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import { selectAnnotator } from '../../store/uiSlice.js';
import SequenceView from '../SequenceView';
import GhostDrillInPanel from './GhostDrillInPanel.jsx';

export default function PreviewTab({
  sequence = '',
  annotations = [],
  topology = 'linear',
  name = 'preview',
}) {
  const annotator = useStore(selectAnnotator);
  const setSelectedGhost = useStore((s) => s.setSelectedGhost);
  const acceptRegion = useStore((s) => s.acceptRegion);
  const rejectRegion = useStore((s) => s.rejectRegion);

  // Flatten predicted regions from every plugin result, filter by
  // threshold, and tag each with a stable id (same shape ResultsPane
  // uses) so accept/reject from the drill-in lands on the right
  // verdict bucket. Without the synthetic-id fallback, regions that
  // arrived from a plugin without an `id` field would silently fail
  // the verdict step.
  const threshold = annotator.threshold ?? 0;
  const predicted = useMemo(() => {
    const out = [];
    const results = annotator.results || {};
    for (const res of Object.values(results)) {
      for (const r of (res?.regions || [])) {
        if (Number.isFinite(r.confidence) && r.confidence < threshold) continue;
        const id = r.id || `${r.start}:${r.end}:${r.type || ''}:${r.name || ''}`;
        // Mark every pipeline-emitted region as predicted so
        // AnnotationTrack renders it as a ghost, even if the
        // underlying detector forgot to set the flag (defensive).
        out.push({ ...r, id, predicted: true });
      }
    }
    return out;
  }, [annotator.results, threshold]);

  const merged = useMemo(() => [
    ...((annotations || []).map((a) => ({ ...a, predicted: a.predicted === true ? true : false }))),
    ...predicted,
  ], [annotations, predicted]);

  const fragments = useMemo(() => [{
    id: 'annotator-preview',
    name,
    sequence,
    type: topology === 'circular' ? 'plasmid' : 'misc_feature',
    strand: 1,
    annotations: merged,
  }], [name, sequence, topology, merged]);

  // Drill-in only opens for predicted regions; clicks on confirmed
  // annotations stay reserved for SequenceView's own selection.
  const onAnnotationClick = (region) => {
    if (!region || region.predicted !== true) return;
    const id = region.id || `${region.start}:${region.end}:${region.type || ''}:${region.name || ''}`;
    setSelectedGhost(id);
  };

  // Re-find the selected region by id so the panel always shows the
  // freshest data (e.g. after a threshold change that re-filters
  // predictions, the panel stays consistent).
  const selectedId = annotator.selectedGhostId;
  const selectedRegion = useMemo(() => {
    if (!selectedId) return null;
    return predicted.find((r) => r.id === selectedId) || null;
  }, [predicted, selectedId]);

  return (
    <div
      data-testid="annotator-preview-tab"
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SequenceView
          fragments={fragments}
          circular={topology === 'circular'}
          readOnly
          onAnnotationClick={onAnnotationClick}
        />
      </div>
      <GhostDrillInPanel
        region={selectedRegion}
        onAccept={() => selectedRegion && acceptRegion(selectedRegion.id)}
        onReject={() => selectedRegion && rejectRegion(selectedRegion.id)}
        onRunBlast={() => { /* K4 stub — wires to live BLAST in M-X.4 */ }}
        onRunPredictors={() => { /* K4 stub — same M-X.4 plumbing */ }}
        onClose={() => setSelectedGhost(null)}
      />
    </div>
  );
}
