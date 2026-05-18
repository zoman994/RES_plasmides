/**
 * BranchingVisual — T9 K11 (§5.7, DEC-T9-11; rewrites the T7 stub).
 * Renders one of three kinds for a zone's N≥2 finals:
 *   clones          — vertical stack, single trunk, «{n} клонов».
 *   design-variants — Y-fork, parallel branches, «{n} вариантов».
 *   independent     — side-by-side, no trunk, «{n} финалов» (T7 default).
 * Kind via selectVariantKindForFinals(state, zoneId). Preserves the
 * T7 testids (zone-seq-branching / zone-seq-branch) for back-compat.
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';
import { selectVariantKindForFinals } from '../../lib/variant-resolver';
import { statusColor, statusIcon } from '../../lib/sanger-helpers';

const B = STRINGS.canvasSkeleton.zones.branching;
const lineBg = 'var(--border-strong, var(--border-subtle))';

export default function BranchingVisual({ finals, state, zoneId }) {
  if (!finals || finals.length < 2) return null;
  const kind = (state && zoneId)
    ? selectVariantKindForFinals(state, zoneId)
    : 'independent';
  const tmpl = kind === 'clones' ? B.clones
    : kind === 'design-variants' ? B.variants
      : B.independent;
  const label = tmpl.replace('{count}', String(finals.length));

  // T10 K10 (§5.7, DEC-T10-07) — clone branch carries a Sanger dot
  // sourced from the parent op's materializedClones entry.
  const cloneEntryFor = (finalId) => {
    for (const op of ((state && state.operations) || [])) {
      if (!Array.isArray(op.materializedClones)) continue;
      const e = op.materializedClones.find((c) => c.cloneId === finalId);
      if (e) return e;
    }
    return null;
  };

  const branch = (f, i) => {
    const entry = kind === 'clones' ? cloneEntryFor(f.id) : null;
    const status = entry ? entry.sangerVerified : undefined;
    return (
      <div
        key={f.id}
        data-testid="zone-seq-branch"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
      >
        <div aria-hidden style={{ width: 2, height: 12, background: lineBg }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'var(--surface-3, var(--surface-2))',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
        >
          <span>{f.name || `/${i + 1}`}</span>
          {entry && status != null && (
            <span
              data-testid="zone-seq-sanger-dot"
              data-status={status}
              title={entry.notes || STRINGS.canvasSkeleton.zones.sanger.statusLabel[status]}
              style={{ color: statusColor(status), fontWeight: 700 }}
            >
              {statusIcon(status)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const vertical = kind === 'clones';
  return (
    <div
      data-testid="zone-seq-branching"
      data-kind={kind}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, gap: 4,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}
      </div>
      {kind !== 'independent' && (
        <div aria-hidden style={{ width: 2, height: 14, background: lineBg }} />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          gap: vertical ? 4 : 12,
          alignItems: 'center',
        }}
      >
        {finals.map(branch)}
      </div>
    </div>
  );
}
