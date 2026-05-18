/**
 * MaterializeCloneModal — T9 K10 (§5.6, R-T9-2). Biolog marks N
 * colonies from an executed reaction. Count 1..96 (96-well plate cap),
 * per-clone editable labels. Esc / backdrop / Cancel all close
 * (ui-interactions modal contract).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { STRINGS } from '../../../lib/strings';

const M = STRINGS.canvasSkeleton.materialize;
const MAX = 96;

export default function MaterializeCloneModal({
  operation, originalContainer, onConfirm, onCancel,
}) {
  const [labels, setLabels] = useState([
    M.cloneLabelTemplate.replace('{n}', '1'),
  ]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const setCount = useCallback((raw) => {
    const n = Math.max(1, Math.min(MAX, Math.floor(Number(raw) || 1)));
    setLabels((prev) => Array.from(
      { length: n },
      (_, i) => prev[i] || M.cloneLabelTemplate.replace('{n}', String(i + 1)),
    ));
  }, []);

  const title = M.modalTitle
    .replace('{kind}', (operation && operation.kind) || '')
    .replace('{output}', (originalContainer && originalContainer.name) || '');

  return (
    <div
      role="dialog"
      data-testid="materialize-clone-modal"
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 120,
        background: 'rgba(28,25,23,0.34)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxHeight: '84%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 8px)',
          boxShadow: 'var(--shadow-md, 0 10px 32px rgba(28,25,23,0.26))',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          fontSize: 12.5,
          fontWeight: 600,
        }}
        >
          {title}
        </div>

        <div style={{ padding: 12, overflowY: 'auto' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
            {M.cloneCountLabel}
            <input
              data-testid="materialize-count"
              type="number"
              min={1}
              max={MAX}
              value={labels.length}
              onChange={(e) => setCount(e.target.value)}
              style={{
                fontSize: 12,
                padding: '4px 6px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                width: 90,
              }}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            {labels.map((label, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <input
                key={idx}
                data-testid="materialize-label"
                value={label}
                onChange={(e) => setLabels((prev) => {
                  const next = prev.slice();
                  next[idx] = e.target.value;
                  return next;
                })}
                style={{
                  fontSize: 11.5,
                  padding: '3px 6px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
        }}
        >
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="materialize-cancel"
            onClick={onCancel}
            style={{
              fontSize: 11.5,
              padding: '5px 12px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            {M.cancel}
          </button>
          <button
            type="button"
            data-testid="materialize-confirm"
            onClick={() => onConfirm({ clones: labels.map((label) => ({ label })) })}
            style={{
              fontSize: 11.5,
              padding: '5px 14px',
              background: 'var(--accent-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {M.confirmCount.replace('{count}', String(labels.length))}
          </button>
        </div>
      </div>
    </div>
  );
}
