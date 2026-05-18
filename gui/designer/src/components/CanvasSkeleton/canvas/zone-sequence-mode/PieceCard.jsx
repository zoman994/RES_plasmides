/**
 * PieceCard — T7 K8 (§5.5). Re-usable piece tile for Palette / strip.
 * Design tokens only (no raw hex except the piece's own colour swatch).
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';
import VariantGroupBadge from '../VariantGroupBadge';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export default function PieceCard({
  piece, sequence, draggable = false, onDragStart, variant = 'palette',
  state, dispatch, ...rest
}) {
  const len = sequence ? sequence.length : 0;
  return (
    <div
      data-testid="zone-seq-piece-card"
      data-piece-id={piece.id}
      data-variant={variant}
      draggable={draggable}
      onDragStart={onDragStart}
      title={piece.name}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: variant === 'strip' ? 80 : 96,
        padding: '6px 8px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${piece.color || 'var(--border-subtle)'}`,
        background: 'var(--surface-2)',
        borderLeft: `4px solid ${piece.color || 'var(--accent-500)'}`,
        cursor: draggable ? 'grab' : 'default',
        userSelect: 'none',
        fontSize: 11,
        color: 'var(--text-primary)',
      }}
      {...rest}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
      }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {piece.name}
        </span>
        {/* T9 K12 — variant badge (renders null unless grouped + state). */}
        <VariantGroupBadge piece={piece} state={state} dispatch={dispatch} />
      </div>
      <div style={{ color: 'var(--text-tertiary)' }}>
        {len} {S.nt}
      </div>
      {piece.functionalLabel && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
          {piece.functionalLabel}
        </div>
      )}
      {variant === 'strip' && (
        <div
          aria-hidden
          style={{
            height: 4,
            borderRadius: 2,
            background: piece.color || 'var(--accent-500)',
            width: Math.max(8, Math.min(160, len * 0.4)),
          }}
        />
      )}
    </div>
  );
}
