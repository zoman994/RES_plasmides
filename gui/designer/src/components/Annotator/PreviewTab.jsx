/**
 * Annotator/PreviewTab — Sprint M-X.3 K3 placeholder, fleshed out
 * in K4.
 *
 * In K3 this is just a placeholder body so the dual-tab shell
 * compiles + renders something when the user switches to «Preview».
 * K4 lands the real implementation:
 *   - Mount <SequenceView /> with merged annotations
 *     (`[...confirmed, ...predicted]`) so AnnotationTrack's
 *     existing dashed-stroke rendering surfaces ghost features.
 *   - Wire single-click on a ghost → drill-in side panel
 *     (Accept / Reject / Run BLAST / Re-run predictors).
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

export default function PreviewTab() {
  return (
    <div
      data-testid="annotator-preview-tab"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: 'var(--text-tertiary)',
        fontSize: 12,
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>{S.previewEmpty}</div>
      <div style={{ fontSize: 10 }}>{S.previewDrillInHint}</div>
    </div>
  );
}
