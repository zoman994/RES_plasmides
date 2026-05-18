/**
 * ImplicitJunction — T7 K8 (DEC-T7-08). Derived (not stored) junction
 * between two adjacent attached pieces. Method inferred from the pair's
 * acquisitionMethod; click → JunctionMethodPicker (wired by parent).
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

const METHOD_COLOR = {
  'overlap-pcr': 'var(--emerald, var(--accent-500))',
  ligation: 'var(--warning-fg, var(--accent-700))',
  gibson: 'var(--accent-500)',
};

export function derivedJunctionMethod(fromPiece, toPiece) {
  const a = fromPiece && fromPiece.acquisitionMethod;
  const b = toPiece && toPiece.acquisitionMethod;
  if (a === 'pcr' && b === 'pcr') return 'overlap-pcr';
  if (a === 'restriction' && b === 'restriction') return 'ligation';
  return 'gibson';
}

export default function ImplicitJunction({ fromPiece, toPiece, onClick }) {
  const method = derivedJunctionMethod(fromPiece, toPiece);
  return (
    <button
      type="button"
      data-testid="zone-seq-junction"
      data-method={method}
      onClick={onClick}
      title={S.junctionMethod[method] || method}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '0 4px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-tertiary)',
        fontSize: 9,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18, height: 3, borderRadius: 2, background: METHOD_COLOR[method] || 'var(--accent-500)',
        }}
      />
      <span>{S.junctionMethodShort[method] || ''}</span>
    </button>
  );
}
