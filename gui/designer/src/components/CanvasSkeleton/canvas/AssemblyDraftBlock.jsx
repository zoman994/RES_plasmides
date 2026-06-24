/**
 * AssemblyDraftBlock — minimal READ-ONLY canvas block for an
 * AssemblyDraft (A1 K7, merge: G1 minimal-in-scope so visual smoke is
 * possible at A1 acceptance — not just dev console). The full editor is
 * A2. Dashed border distinguishes it from a real ContainerBlock.
 *
 *   Header  : 🧬 {name} · {N} bp · linear|circular
 *   MiniMap : horizontal coloured-zone strip (one rect per segment)
 *   Footer  : {N} сегментов  [+ orphan warning if any]
 */
import { memo } from 'react';
import { segmentBoundaries, computeAssemblySequence } from '../lib/assembly-model';
import { Icon } from '../../icons/Icon';

function AssemblyDraftBlock({
  draft, isHighlighted, isDragging, onPointerDown, onClick, onDoubleClick,
}) {
  const { boundaries, totalLength } = segmentBoundaries(draft);
  const { orphans } = computeAssemblySequence(draft);
  const W = 240;
  const stripW = W - 20;

  return (
    <div
      data-testid={`assembly-draft-block-${draft.id}`}
      data-assembly-id={draft.id}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        width: W,
        minHeight: 130,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        border: `2px dashed ${isHighlighted ? 'var(--accent-500, #b85c3e)' : 'var(--border-default, #d6d3d1)'}`,
        borderRadius: 8,
        boxShadow: isDragging
          ? '0 6px 18px rgba(28,25,23,0.18)'
          : '0 1px 3px rgba(28,25,23,0.08)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
        <Icon name="dna" size={14} aria-hidden style={{ display: 'block', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        >{draft.name}</span>
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>
          {totalLength} bp · {draft.topology?.circular ? 'circular' : 'linear'}
        </span>
      </div>

      <svg
        data-testid={`assembly-draft-strip-${draft.id}`}
        width={stripW}
        height={22}
        viewBox={`0 0 ${stripW} 22`}
        style={{ display: 'block' }}
      >
        <rect x={0} y={6} width={stripW} height={10} rx={2} fill="var(--surface-2)" />
        {boundaries.map((b) => {
          const x = totalLength > 0 ? (b.startOnAssembly / totalLength) * stripW : 0;
          const w = totalLength > 0
            ? Math.max(1, ((b.endOnAssembly - b.startOnAssembly) / totalLength) * stripW)
            : 0;
          return (
            <rect
              key={b.segmentId}
              data-testid="assembly-zone"
              data-segment-id={b.segmentId}
              x={x} y={6} width={w} height={10} rx={1}
              fill={b.color}
              opacity={0.9}
            >
              <title>{`${b.label || b.source?.type || 'segment'} · ${b.endOnAssembly - b.startOnAssembly} bp`}</title>
            </rect>
          );
        })}
      </svg>

      <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{draft.segments.length} сегм.</span>
        {orphans.length > 0 && (
          <span data-testid={`assembly-orphan-warn-${draft.id}`} style={{ color: 'var(--accent-500, #b85c3e)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="warning" size={11} aria-hidden /> {orphans.length} orphan
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(AssemblyDraftBlock);
