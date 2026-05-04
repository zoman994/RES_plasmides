/**
 * Annotator/GhostDrillInPanel — Sprint M-X.3 K4.
 *
 * Right-aligned slide-over inside PreviewTab. Opens when the user
 * single-clicks a predicted (ghost) feature in the SequenceView.
 * Surfaces the drill-in toolkit:
 *   - region info (name, type, coords, confidence, source plugin)
 *   - Accept / Reject (verdict — same actions as Table tab buttons)
 *   - Run BLAST on this region (stub today; wires to live BLAST in
 *     M-X.4 once the backend lands)
 *   - Re-run predictors with a relaxed threshold (stub)
 *   - Close (clears selectedGhost without applying a verdict)
 *
 * The panel is a controlled component — `region` comes in via props,
 * `null` means «hidden». Verdict actions delegate to the parent so
 * PreviewTab owns the wiring to `acceptRegion / rejectRegion`.
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

export default function GhostDrillInPanel({
  region,
  onAccept,
  onReject,
  onRunBlast,
  onRunPredictors,
  onClose,
}) {
  if (!region) return null;

  const start = (region.start || 0) + 1; // 1-based for the UI
  const end = region.end || 0;
  const confidencePct = Number.isFinite(region.confidence)
    ? region.confidence * 100
    : null;

  return (
    <div
      data-testid="annotator-ghost-drill-in"
      data-region-id={region.id || ''}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: 'var(--surface-1, #fff)',
        color: 'var(--text-primary, #111)',
        borderLeft: '0.5px solid var(--border-default, #d4d4d4)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--border-subtle)',
        display: 'flex', alignItems: 'baseline', gap: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{S.ghostDrillInTitle}</div>
        <button
          type="button"
          data-testid="annotator-ghost-close"
          onClick={onClose}
          style={{
            fontSize: 11, padding: '2px 6px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
          }}
        >✕</button>
      </div>

      {/* Region info */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, fontStyle: region.predicted ? 'italic' : 'normal',
          color: 'var(--text-primary)',
        }}>{region.predicted ? `~${region.name || region.type || '(unnamed)'}` : (region.name || region.type)}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {region.type || 'feature'} · {region.strand === -1 ? '−' : '+'}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {S.ghostDrillInRange(start, end)}
        </div>
        {confidencePct !== null && (
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            {S.ghostDrillInConfidence(confidencePct)}
          </div>
        )}
        {region.source && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {S.ghostDrillInSource(region.source)}
          </div>
        )}
      </div>

      {/* Verdict buttons */}
      <div style={{
        padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <button
          type="button"
          data-testid="annotator-ghost-accept"
          onClick={onAccept}
          style={primaryBtnStyle('var(--accent-500, #f97316)')}
        >{S.ghostDrillInAccept}</button>
        <button
          type="button"
          data-testid="annotator-ghost-reject"
          onClick={onReject}
          style={secondaryBtnStyle()}
        >{S.ghostDrillInReject}</button>
      </div>

      {/* Tools — the drill-in toolkit (stubs in K4; wired in M-X.4). */}
      <div style={{
        marginTop: 'auto',
        padding: '12px 14px',
        borderTop: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-2, #f5f5f4)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <button
          type="button"
          data-testid="annotator-ghost-blast"
          onClick={onRunBlast}
          style={secondaryBtnStyle()}
        >{S.ghostDrillInBlast}</button>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
          {S.ghostDrillInBlastHint}
        </div>
        <button
          type="button"
          data-testid="annotator-ghost-predictors"
          onClick={onRunPredictors}
          style={secondaryBtnStyle()}
        >{S.ghostDrillInPredictors}</button>
      </div>
    </div>
  );
}

function primaryBtnStyle(bg) {
  return {
    fontSize: 12, padding: '6px 12px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm, 3px)',
    cursor: 'pointer',
    fontWeight: 500,
  };
}
function secondaryBtnStyle() {
  return {
    fontSize: 11, padding: '6px 10px',
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 3px)',
    cursor: 'pointer',
  };
}
