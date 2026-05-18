/**
 * VariantGroupBadge — T9 K9 (§5.5, DEC-T9-08). Small chip on a piece
 * that belongs to a design-variant group. Hover → «Вариант N из M»;
 * click → highlight all group members (2s). Renders null otherwise.
 */
import React from 'react';
import { STRINGS } from '../../../lib/strings';
import { variantGroupLabel } from '../lib/variant-resolver';

const VG = STRINGS.canvasSkeleton.pieces.variantGroup;

export default function VariantGroupBadge({ piece, state, dispatch }) {
  if (!piece || !piece.variantGroupId) return null;
  const { index, total } = variantGroupLabel(state, piece.variantGroupId, piece.id);
  const label = VG.badge.replace('{n}', String(index)).replace('{total}', String(total));
  return (
    <button
      type="button"
      data-testid="variant-group-badge"
      data-variant-group={piece.variantGroupId}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (dispatch) {
          dispatch({
            type: 'HIGHLIGHT_VARIANT_GROUP',
            variantGroupId: piece.variantGroupId,
            durationMs: 2000,
          });
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        font: '600 9.5px var(--font-ui)',
        padding: '0 4px',
        height: 16,
        borderRadius: 'var(--radius-sm, 4px)',
        border: '1px solid var(--accent-500)',
        background: 'var(--accent-wash, var(--surface-3))',
        color: 'var(--accent-700, var(--text-secondary))',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <span aria-hidden>⑂</span>
      <span>{index}/{total}</span>
    </button>
  );
}
