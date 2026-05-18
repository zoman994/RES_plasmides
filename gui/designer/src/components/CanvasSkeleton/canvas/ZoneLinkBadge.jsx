/**
 * ZoneLinkBadge — T8 K7 (§5.5, DEC-T8-08/10). Header chip for a
 * cross-zone source: «← {zone}» + a count when >1. Click navigates to
 * the source zone (parent pans/highlights). stopPropagation so it
 * never starts the zone-header drag (R-T8-4 / consistency with K9-T7).
 */
import React from 'react';
import { STRINGS } from '../../../lib/strings';

const LB = STRINGS.canvasSkeleton.zones.linkBadge;

export default function ZoneLinkBadge({ sourceZoneName, pieceCount = 1, onClick }) {
  const label = LB.label.replace('{zone}', sourceZoneName);
  const title = LB.tooltip
    .replace('{zone}', sourceZoneName)
    .replace('{count}', String(pieceCount));
  return (
    <button
      type="button"
      data-testid="zone-link-badge"
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (onClick) onClick(); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        font: '500 10.5px var(--font-ui)',
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm, 4px)',
        border: '1px solid var(--zone-border)',
        background: 'var(--surface-2)',
        color: 'var(--zone-header-fg)',
        cursor: 'pointer',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
        maxWidth: 140,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {pieceCount > 1 && (
        <span
          data-testid="zone-link-badge-count"
          style={{
            fontSize: 9,
            lineHeight: '14px',
            minWidth: 14,
            textAlign: 'center',
            borderRadius: 7,
            background: 'var(--accent-wash, var(--surface-3))',
            color: 'var(--accent-700, var(--text-secondary))',
          }}
        >
          {pieceCount}
        </span>
      )}
    </button>
  );
}
