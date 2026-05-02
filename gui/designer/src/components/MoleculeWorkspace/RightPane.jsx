import { useMemo } from 'react';
import SequenceMapView from '../SequenceMapView';
import { WORKSPACE_STRINGS as W } from './lib/workspace-strings';

/**
 * RightPane (M-B.1 K4, DEC-IMP-12 ⚓).
 *
 * Wraps SequenceMapView for read-only molecule preview. SequenceMapView is
 * fragments-shaped, so we synthesise a single fragment from the workspace's
 * sequence + annotations (flat array). v0.5 store fields like `showReSites`
 * are absent in v0.6 — `useStore(s => s.showReSites)` returns `undefined`,
 * which makes the RE-overlay code paths inside SequenceMapView short-circuit
 * naturally. No fork required (smoke-mount status: OK, see §5).
 *
 * `sequenceReadOnly` is the contract — SequenceMapView has no edit affordance
 * to suppress; selection inside it is its own internal UI state. The flag is
 * still surfaced as a visible badge so the wrapping context (Importer M-B.1
 * always true; Container Window M-D variable) stays explicit to the biolog.
 */
export default function RightPane({
  sequence,
  annotations,
  topology,
  name,
  selectedAnnotation,
  sequenceReadOnly = true,
  onAddCustomPrimer,
}) {
  const fragments = useMemo(() => {
    if (!sequence) return [];
    return [{
      id: 'molecule-workspace-fragment',
      name: name || 'molecule',
      type: 'misc_feature',
      sequence,
      annotations: annotations || [],
      strand: 1,
    }];
  }, [sequence, annotations, name]);

  const length = sequence?.length || 0;

  return (
    <div
      data-testid="molecule-workspace-right"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <div
        data-testid="molecule-workspace-right-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
          {W.paneSequenceTitle}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {W.sequenceLengthBadge(length)}
        </div>
        {sequenceReadOnly && (
          <div
            data-testid="molecule-workspace-readonly-badge"
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--surface-2, #f5f5f4)',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >{W.sequenceReadOnlyBadge}</div>
        )}
        {selectedAnnotation && (
          <div
            data-testid="molecule-workspace-selection-banner"
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--accent-text, #92400e)',
            }}
          >
            {W.selectedAnnotationFooter(
              selectedAnnotation.name || '—',
              selectedAnnotation.start || 0,
              selectedAnnotation.end || 0,
            )}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {length > 0 ? (
          <SequenceMapView
            fragments={fragments}
            primers={[]}
            circular={topology === 'circular'}
            onAddCustomPrimer={sequenceReadOnly ? undefined : onAddCustomPrimer}
          />
        ) : (
          <div style={{
            padding: 24, fontSize: 13, color: 'var(--text-tertiary)',
          }}>{W.empty}</div>
        )}
      </div>
    </div>
  );
}
