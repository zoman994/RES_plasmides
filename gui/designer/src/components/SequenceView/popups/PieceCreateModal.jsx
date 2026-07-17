/**
 * PieceCreateModal — T5 K5 (DEC-T5-03/09/10). Self-contained overlay;
 * ModalStack is an App-level aggregator, not a primitive. Esc, backdrop and
 * Cancel close the modal. Colours use design tokens.
 */
import React, { useEffect, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const M = STRINGS.canvasSkeleton.pieces.modal.create;
const ORIGIN = STRINGS.canvasSkeleton.pieces.originLabel;
const PCR_ORIGINS = new Set(['existing-primers', 'new-primers']);

export default function PieceCreateModal({
  containerName, range, origin, featureName, onConfirm, onCancel,
}) {
  const autoName = featureName
    || `${containerName}(${range.start}-${range.end})`;
  const [name, setName] = useState(autoName);
  const [fnLabel, setFnLabel] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel && onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const confirm = () => onConfirm({
    name: name.trim() || autoName,
    functionalLabel: fnLabel.trim() || null,
  });

  const len = Math.abs(range.end - range.start);
  const fieldStyle = {
    width: '100%', padding: '6px 8px', fontSize: 13,
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
  };

  return (
    <div
      data-testid="piece-create-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="piece-create-modal"
        style={{
          width: 420, padding: 20,
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)', font: 'var(--font-ui)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>{M.title}</h3>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{M.sourceLabel} {containerName}</span>
          <span>{M.rangeLabel} {range.start}–{range.end} ({len} п.о.)</span>
          <span>{M.orientationLabel} {range.orientation === 'reverse' ? '←' : '→'}</span>
          <span>{M.methodLabel} {ORIGIN[origin] || origin}</span>
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {M.nameLabel}
          <input
            data-testid="piece-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {M.functionalLabelLabel}
          <input
            data-testid="piece-fnlabel-input"
            value={fnLabel}
            placeholder={M.functionalLabelPlaceholder}
            onChange={(e) => setFnLabel(e.target.value)}
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        <div data-testid="piece-method-hint" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {PCR_ORIGINS.has(origin) ? M.acquisitionPcrHint : M.acquisitionUndefinedHint}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            data-testid="piece-create-cancel"
            onClick={() => onCancel && onCancel()}
            style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
          >
            {M.cancel}
          </button>
          <button
            type="button"
            data-testid="piece-create-confirm"
            onClick={confirm}
            style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer', background: 'var(--accent-500)', color: 'var(--surface-1)', border: '1px solid var(--accent-700)', borderRadius: 'var(--radius-md)' }}
          >
            {M.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
