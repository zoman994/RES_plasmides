/**
 * Annotator/TargetPreview — Sprint M-X.2 K8.
 *
 * Compact linear feature strip mounted at the top of the Annotator
 * fullscreen body. Read-only — no drag-scrubber, no click handlers.
 * Optionally highlights the current scope region (when scope.kind ===
 * 'region') as a translucent overlay.
 *
 * Reuses the visual style of `Importer/inspector/tabs/LinearFeatureBar`
 * (palette + 22 px height) but skips its scrubber wiring.
 */

import { useMemo } from 'react';
import { featureColor } from '../../feature-palette';

const BAR_H = 22;

export default function TargetPreview({ annotations, sequenceLength, scope }) {
  const seqLen = Math.max(1, sequenceLength | 0);
  const regions = useMemo(() => {
    return (annotations || []).filter((a) => a && a.level === 'region');
  }, [annotations]);

  const scopeOverlay = scope && scope.kind === 'region' && scope.region
    ? {
      left: (scope.region.start / seqLen) * 100,
      width: ((scope.region.end - scope.region.start) / seqLen) * 100,
    }
    : null;

  return (
    <div
      data-testid="annotator-target-preview"
      style={{
        position: 'relative',
        width: '100%',
        height: BAR_H,
        background: 'var(--surface-2, #f5f5f4)',
        borderRadius: 'var(--radius-sm, 3px)',
        border: '0.5px solid var(--border-default, #d4d4d4)',
        overflow: 'hidden',
      }}
    >
      <svg width="100%" height={BAR_H} preserveAspectRatio="none" viewBox={`0 0 ${seqLen} ${BAR_H}`}>
        {regions.map((r) => {
          const start = Math.max(0, r.start | 0);
          const end = Math.min(seqLen, r.end | 0);
          if (end <= start) return null;
          return (
            <rect
              key={r.id || `${start}:${end}:${r.name || ''}`}
              x={start}
              y={2}
              width={end - start}
              height={BAR_H - 4}
              fill={featureColor(r.type, r.name) || 'var(--text-tertiary)'}
              opacity={0.85}
            >
              <title>{r.name || r.type || 'feature'} ({start + 1}..{end})</title>
            </rect>
          );
        })}
      </svg>
      {scopeOverlay && (
        <div
          data-testid="annotator-target-preview-scope"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${scopeOverlay.left}%`,
            width: `${Math.max(0.5, scopeOverlay.width)}%`,
            background: 'rgba(249, 115, 22, 0.30)',
            outline: '1px solid var(--accent-500, #f97316)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
