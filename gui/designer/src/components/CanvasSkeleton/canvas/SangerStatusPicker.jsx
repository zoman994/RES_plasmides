/**
 * SangerStatusPicker — T10 K5 (§5.6, DEC-T10-04). Segmented control:
 * ○ pending / ✓ verified / ✗ failed + (−) reset to null.
 */
import React from 'react';
import { STRINGS } from '../../../lib/strings';
import { statusColor, statusIcon } from '../lib/sanger-helpers';

const SL = STRINGS.canvasSkeleton.zones.sanger.statusLabel;
const SEGMENTS = [
  ['pending', SL.pending],
  ['verified', SL.verified],
  ['failed', SL.failed],
];

export default function SangerStatusPicker({ status, onSet }) {
  const seg = (value, title) => {
    const active = status === value;
    return (
      <button
        key={value}
        type="button"
        data-testid={`sanger-status-${value}`}
        data-status={value}
        data-active={active ? 'true' : 'false'}
        title={title}
        onClick={(e) => { e.stopPropagation(); onSet(value); }}
        style={{
          font: '600 12px var(--font-ui)',
          width: 24,
          height: 22,
          border: `1px solid ${active ? statusColor(value) : 'var(--border-subtle)'}`,
          background: active ? 'var(--sanger-row-hover)' : 'var(--surface-1)',
          color: statusColor(value) === 'transparent' ? 'var(--text-tertiary)' : statusColor(value),
          cursor: 'pointer',
        }}
      >
        {statusIcon(value)}
      </button>
    );
  };
  return (
    <div
      data-testid="sanger-status-picker"
      role="group"
      style={{ display: 'inline-flex', gap: 2 }}
    >
      {SEGMENTS.map(([v, t]) => seg(v, t))}
      <button
        type="button"
        data-testid="sanger-status-reset"
        data-status="unplanned"
        data-active={status == null ? 'true' : 'false'}
        title={SL.unplanned}
        onClick={(e) => { e.stopPropagation(); onSet(null); }}
        style={{
          font: '600 12px var(--font-ui)',
          width: 24,
          height: 22,
          border: `1px solid ${status == null ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
          background: status == null ? 'var(--sanger-row-hover)' : 'var(--surface-1)',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
        }}
      >
        −
      </button>
    </div>
  );
}
