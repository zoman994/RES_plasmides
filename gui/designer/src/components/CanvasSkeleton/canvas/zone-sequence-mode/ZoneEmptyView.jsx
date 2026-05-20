/**
 * ZoneEmptyView — T7 K8 (§5.2). Zone has sources but no pieces yet.
 * Hint + double-click a source → open its container editor.
 */
import React, { useState } from 'react';
import { STRINGS } from '../../../../lib/strings';
import AddPiecePopover from '../AddPiecePopover';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export default function ZoneEmptyView({ sources, dispatch, zoneId }) {
  // AV-K6 — click on empty area to add a piece via the shared popover.
  const [addOpen, setAddOpen] = useState(false);
  const handleAddPick = (kind) => {
    setAddOpen(false);
    if (typeof dispatch !== 'function') return;
    dispatch({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: zoneId });
    dispatch({ type: 'REQUEST_ASSEMBLY_ADD_KIND', zoneId, kind });
  };
  return (
    <div
      data-testid="zone-seq-empty"
      onClick={() => setAddOpen(true)}
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        overflow: 'auto',
        color: 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
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
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (dispatch) dispatch({ type: 'OPEN_EDITOR_FOR_CONTAINER', containerId: c.id, zoneId });
            }}
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
      <div
        style={{
          marginTop: 'auto',
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          padding: '6px 0',
          textAlign: 'center',
        }}
      >
        Кликни на пустое место — добавить кусок (Плазмида / Обвес / Синтез / Заглушка)
      </div>
      {addOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <AddPiecePopover
              onPick={handleAddPick}
              onClose={() => setAddOpen(false)}
              testId={`zone-seq-empty-add-${zoneId}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
