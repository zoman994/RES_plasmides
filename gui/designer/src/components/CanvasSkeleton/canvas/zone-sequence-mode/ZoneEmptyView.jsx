/**
 * ZoneEmptyView — T7 K8 (§5.2). Zone has sources but no pieces yet.
 * Hint + double-click a source → open its container editor.
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export default function ZoneEmptyView({ sources, dispatch, zoneId }) {
  return (
    <div
      data-testid="zone-seq-empty"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        overflow: 'auto',
        color: 'var(--text-secondary)',
        fontSize: 12,
      }}
    >
      <div>{S.emptyHint}</div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
        {S.availableSources}:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(sources || []).map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid="zone-seq-source"
            data-container-id={c.id}
            title={`${(c.sequence || '').length} ${S.nt}`}
            onDoubleClick={() => dispatch
              && dispatch({ type: 'OPEN_EDITOR_FOR_CONTAINER', containerId: c.id, zoneId })}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
