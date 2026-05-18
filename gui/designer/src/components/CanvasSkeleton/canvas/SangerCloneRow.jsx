/**
 * SangerCloneRow — T10 K6 (§5.5). One materialized clone: editable
 * label, status picker, notes textarea (saved on blur, ≤500).
 */
import React, { useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import SangerStatusPicker from './SangerStatusPicker';

const SN = STRINGS.canvasSkeleton.zones.sanger;

export default function SangerCloneRow({ clone, opId, dispatch }) {
  const [notes, setNotes] = useState(clone.notes || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(clone.label || '');

  const setStatus = (status) => dispatch({
    type: 'SET_CLONE_SANGER_STATUS', operationId: opId, cloneId: clone.cloneId, status,
  });
  const commitNotes = () => {
    if (notes !== (clone.notes || '')) {
      dispatch({
        type: 'SET_CLONE_NOTES', operationId: opId, cloneId: clone.cloneId, notes,
      });
    }
  };
  const commitLabel = () => {
    const v = labelValue.trim();
    if (v && v !== clone.label) {
      dispatch({
        type: 'SET_CLONE_LABEL', operationId: opId, cloneId: clone.cloneId, label: v,
      });
    }
    setEditingLabel(false);
  };

  return (
    <div
      data-testid="sanger-clone-row"
      data-status={clone.sangerVerified || 'unplanned'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 8px',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 11.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {editingLabel ? (
          <input
            data-testid="sanger-clone-label-input"
            autoFocus
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              else if (e.key === 'Escape') setEditingLabel(false);
            }}
            style={{
              flex: 1,
              fontSize: 11.5,
              padding: '2px 4px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <span
            data-testid="sanger-clone-label"
            onClick={() => setEditingLabel(true)}
            style={{
              flex: 1, fontWeight: 600, cursor: 'text', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {clone.label}
          </span>
        )}
        <SangerStatusPicker status={clone.sangerVerified} onSet={setStatus} />
      </div>
      <textarea
        data-testid="sanger-clone-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commitNotes}
        placeholder={SN.notesPlaceholder}
        rows={2}
        maxLength={500}
        style={{
          resize: 'vertical',
          fontSize: 11,
          padding: '3px 6px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          background: 'var(--surface-2)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}
