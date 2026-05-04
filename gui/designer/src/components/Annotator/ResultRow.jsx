/**
 * Annotator/ResultRow — Sprint M-X.2 K8.
 *
 * One row of a plugin's results pane: name + uiCoords + confidence
 * pill + 3 buttons (Принять / Отклонить / Редактировать).
 *
 * Status (accepted / rejected / pending) reflected via row
 * background tint + button highlighting. The Edit button toggles
 * inline-edit mode (name + coords inputs).
 */

import { useState } from 'react';
import { STRINGS } from '../../lib/strings';
import { toUiCoords } from '../../lib/annotation-edit.js';

const S = STRINGS.importer.annotator;

export default function ResultRow({
  region,
  pendingPatch,
  isAccepted,
  isRejected,
  onAccept,
  onReject,
  onEditPatch,
}) {
  const [editing, setEditing] = useState(false);
  const merged = { ...region, ...(pendingPatch || {}) };
  const ui = toUiCoords(merged.start, merged.end);

  const stateBg = isAccepted
    ? 'rgba(34, 197, 94, 0.10)'
    : isRejected
      ? 'rgba(239, 68, 68, 0.10)'
      : 'transparent';

  return (
    <div
      data-testid="annotator-result-row"
      data-region-id={merged.id || ''}
      data-state={isAccepted ? 'accepted' : isRejected ? 'rejected' : 'pending'}
      style={{
        display: 'flex', flexDirection: 'column',
        gap: 4, padding: '6px 8px',
        borderRadius: 'var(--radius-sm, 3px)',
        background: stateBg,
        fontSize: 11,
        border: '0.5px solid var(--border-default, #d4d4d4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary, #111)' }}>
          {merged.name || merged.type || '(unnamed)'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
          {ui.uiStart}..{ui.uiEnd}
        </span>
        {Number.isFinite(merged.confidence) ? (
          <span style={{
            padding: '1px 5px', borderRadius: 8, fontSize: 9,
            background: 'var(--surface-2, #f5f5f4)',
            color: 'var(--text-secondary)',
          }}>
            {(merged.confidence * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            data-testid="annotator-result-name-input"
            defaultValue={merged.name || ''}
            onBlur={(e) => {
              if (e.target.value !== (region.name || '')) {
                onEditPatch?.({ name: e.target.value });
              }
              setEditing(false);
            }}
            style={{
              flex: 1, padding: '2px 6px', fontSize: 11,
              border: '0.5px solid var(--accent-500, #f97316)',
              borderRadius: 'var(--radius-sm, 3px)',
            }}
            autoFocus
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          data-testid="annotator-result-accept"
          onClick={onAccept}
          style={{
            flex: 1, padding: '3px 6px',
            border: '0.5px solid var(--border-default)',
            background: isAccepted ? 'rgba(34, 197, 94, 0.30)' : 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{isAccepted ? S.resultAccepted : S.resultAccept}</button>
        <button
          type="button"
          data-testid="annotator-result-reject"
          onClick={onReject}
          style={{
            flex: 1, padding: '3px 6px',
            border: '0.5px solid var(--border-default)',
            background: isRejected ? 'rgba(239, 68, 68, 0.30)' : 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{isRejected ? S.resultRejected : S.resultReject}</button>
        <button
          type="button"
          data-testid="annotator-result-edit"
          onClick={() => setEditing(!editing)}
          style={{
            padding: '3px 8px',
            border: '0.5px solid var(--border-default)',
            background: 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{S.resultEdit}</button>
      </div>
    </div>
  );
}
