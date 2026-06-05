/**
 * ImplicitJunction — T7 K8 (DEC-T7-08); JUNCTION layer 3 J6b. The junction
 * element between two adjacent attached pieces on the zone strip. Now PREFERS
 * the STORED per-junction method (zone.junctions[pairKey].method, passed by the
 * parent), falling back to the acquisitionMethod-derived one when no config is
 * seeded yet. Colour/label come from the shared junction-styles palette (one
 * source for strip / popover / glyph). Click → OPEN_JUNCTION_METHOD_PICKER
 * (wired by ZoneAssembledView → JunctionControl).
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';
import { junctionStroke, junctionLabel } from '../junction-styles';
import { junctionKindForMethod } from '../../lib/junction-derive';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export function derivedJunctionMethod(fromPiece, toPiece) {
  const a = fromPiece && fromPiece.acquisitionMethod;
  const b = toPiece && toPiece.acquisitionMethod;
  if (a === 'pcr' && b === 'pcr') return 'overlap-pcr';
  if (a === 'restriction' && b === 'restriction') return 'ligation';
  return 'gibson';
}

// Effective method (stored engine dict, else derived-display) → junction.kind.
// The derived display strings aren't in the engine dict, so map them here.
const DERIVED_KIND = { 'overlap-pcr': 'overlap', gibson: 'overlap', ligation: 're_ligation' };
function kindOf(method) {
  return DERIVED_KIND[method] || junctionKindForMethod(method);
}

export default function ImplicitJunction({ fromPiece, toPiece, method, onClick }) {
  const effective = method || derivedJunctionMethod(fromPiece, toPiece);
  const kind = kindOf(effective);
  return (
    <button
      type="button"
      data-testid="zone-seq-junction"
      data-method={effective}
      data-junction-kind={kind}
      onClick={onClick}
      title={S.junctionMethod[effective] || effective}
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
          width: 18, height: 3, borderRadius: 2, background: junctionStroke(kind),
        }}
      />
      <span>{junctionLabel(kind)}</span>
    </button>
  );
}
