/**
 * SangerLabNotebook — T10 K7 (§5.4, DEC-T10-01/02/08/09). Right-edge
 * slide-in panel, per focused zone: summary counts, filter, clones
 * grouped by parent op. The electronic version of the biolog's paper
 * "colonies / verified" table.
 */
import React, { useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { selectSangerSummaryForZone } from '../store/selectors-pieces';
import SangerCloneRow from './SangerCloneRow';

const SN = STRINGS.canvasSkeleton.zones.sanger;
const FILTERS = ['all', 'pending', 'verified', 'failed'];

export default function SangerLabNotebook({
  state, dispatch, zoneId, onClose,
}) {
  const [filter, setFilter] = useState('all');
  const { groupedByOp, counts } = selectSangerSummaryForZone(state, zoneId);
  const zone = ((state && state.zones) || []).find((z) => z.id === zoneId);

  const groups = groupedByOp
    .map(({ op, clones }) => ({
      op,
      clones: clones.filter((c) => filter === 'all' || c.sangerVerified === filter),
    }))
    .filter((g) => g.clones.length > 0);

  return (
    <aside
      data-testid="sanger-lab-notebook"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--sanger-notebook-bg)',
        borderLeft: '1px solid var(--sanger-notebook-border)',
        boxShadow: 'var(--shadow-md, -4px 0 16px rgba(28,25,23,0.12))',
        color: 'var(--text-primary)',
        fontSize: 12,
      }}
    >
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
      }}
      >
        <strong style={{ fontSize: 12.5, flex: 1 }}>{SN.title}</strong>
        <button
          type="button"
          data-testid="sanger-notebook-close"
          onClick={onClose}
          aria-label={SN.close}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 14,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: '6px 10px', color: 'var(--text-tertiary)', fontSize: 11 }}>
        {SN.zoneLabel.replace('{name}', (zone && zone.name) || '—')}
      </div>

      <div style={{
        display: 'flex', gap: 10, padding: '4px 10px', fontSize: 11,
      }}
      >
        <span style={{ color: 'var(--sanger-pending)' }}>{counts.pending} {SN.pendingShort}</span>
        <span style={{ color: 'var(--sanger-verified)' }}>{counts.verified} {SN.verifiedShort}</span>
        <span style={{ color: 'var(--sanger-failed)' }}>{counts.failed} {SN.failedShort}</span>
      </div>

      <div style={{
        display: 'flex', gap: 4, padding: '4px 10px', borderBottom: '1px solid var(--border-subtle)',
      }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`sanger-filter-${f}`}
            data-active={filter === f ? 'true' : 'false'}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 10.5,
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${filter === f ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
              background: filter === f ? 'var(--sanger-row-hover)' : 'var(--surface-1)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {SN.filter[f]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {groups.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 11.5 }}>
            {SN.empty}
          </div>
        ) : (
          groups.map(({ op, clones }) => (
            <div key={op.id}>
              <div style={{
                display: 'flex',
                gap: 6,
                padding: '4px 10px',
                background: 'var(--surface-2)',
                color: 'var(--text-secondary)',
                fontSize: 10.5,
                fontWeight: 600,
                position: 'sticky',
                top: 0,
              }}
              >
                <span>{op.kind}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{(op.name || op.id).slice(0, 12)}</span>
              </div>
              {clones.map((clone) => (
                <SangerCloneRow
                  key={clone.cloneId}
                  clone={clone}
                  opId={op.id}
                  dispatch={dispatch}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
