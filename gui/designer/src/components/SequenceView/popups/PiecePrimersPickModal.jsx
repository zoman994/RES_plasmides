/**
 * PiecePrimersPickModal — T5 K6 (DEC-T5-04/06). Pick fwd/rev primer
 * entries; live amplicon preview via buildPieceFromExistingPrimers
 * (indexOf + revRC). Confirm gated on a valid binding. Self-contained
 * overlay (Esc/backdrop/Cancel), design tokens.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { buildPieceFromExistingPrimers } from '../../CanvasSkeleton/lib/piece-authoring';

const PP = STRINGS.canvasSkeleton.pieces.modal.primersPick;

const fieldStyle = {
  width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4,
  background: 'var(--surface-1)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
};

export default function PiecePrimersPickModal({
  containerId, containerName, containerSequence, primers, onConfirm, onCancel,
}) {
  const [fwdId, setFwdId] = useState('');
  const [revId, setRevId] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel && onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const result = useMemo(() => {
    if (!primers || primers.length === 0) return { kind: 'empty' };
    if (!fwdId || !revId) return { kind: 'pending' };
    const fwd = primers.find((p) => p.id === fwdId);
    const rev = primers.find((p) => p.id === revId);
    if (!fwd || !rev) return { kind: 'pending' };
    try {
      const piece = buildPieceFromExistingPrimers(
        { id: containerId, name: containerName, sequence: containerSequence },
        fwd.sequence || (fwd.payload && fwd.payload.sequence) || '',
        rev.sequence || (rev.payload && rev.payload.sequence) || '',
      );
      return { kind: 'ok', piece };
    } catch (e) {
      return { kind: 'error', error: e.message };
    }
  }, [fwdId, revId, primers, containerId, containerName, containerSequence]);

  const r0 = result.kind === 'ok' ? result.piece.ranges[0] : null;
  const autoName = r0 ? `${containerName}(${r0.start}-${r0.end})` : '';
  const status = result.kind === 'empty' ? PP.emptyHint
    : result.kind === 'pending' ? PP.bindingHint
      : result.kind === 'error' ? result.error
        : PP.bindingPreview
          .replace('{start}', String(r0.start))
          .replace('{end}', String(r0.end))
          .replace('{length}', String(r0.end - r0.start));

  const Select = ({ tid, value, onChange }) => (
    <select
      data-testid={tid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={fieldStyle}
    >
      <option value="">—</option>
      {(primers || []).map((p) => (
        <option key={p.id} value={p.id}>{p.name || p.id}</option>
      ))}
    </select>
  );

  return (
    <div
      data-testid="primers-pick-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel && onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="primers-pick-modal"
        style={{
          width: 440, padding: 20, font: 'var(--font-ui)',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>{PP.title}</h3>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {STRINGS.canvasSkeleton.pieces.modal.create.sourceLabel} {containerName}
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {PP.forwardLabel}
          <Select tid="primer-pick-fwd" value={fwdId} onChange={setFwdId} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {PP.reverseLabel}
          <Select tid="primer-pick-rev" value={revId} onChange={setRevId} />
        </label>
        <div
          data-testid="primers-pick-status"
          style={{
            fontSize: 12,
            color: result.kind === 'ok' ? 'var(--text-secondary)' : 'var(--warning-fg)',
          }}
        >
          {status}
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {PP.nameLabel}
          <input
            data-testid="primers-pick-name"
            value={name}
            placeholder={autoName}
            onChange={(e) => setName(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            data-testid="primers-pick-cancel"
            onClick={() => onCancel && onCancel()}
            style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
          >
            {STRINGS.canvasSkeleton.pieces.modal.create.cancel}
          </button>
          <button
            type="button"
            data-testid="primers-pick-confirm"
            disabled={result.kind !== 'ok'}
            onClick={() => onConfirm({ ...result.piece, name: name.trim() || autoName })}
            style={{
              padding: '6px 14px', fontSize: 13,
              cursor: result.kind === 'ok' ? 'pointer' : 'not-allowed',
              opacity: result.kind === 'ok' ? 1 : 0.5,
              background: 'var(--accent-500)', color: 'var(--surface-1)',
              border: '1px solid var(--accent-700)', borderRadius: 'var(--radius-md)',
            }}
          >
            {STRINGS.canvasSkeleton.pieces.modal.create.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
