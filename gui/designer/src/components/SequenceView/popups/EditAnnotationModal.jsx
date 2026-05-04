/**
 * EditAnnotationModal — Sprint M-X.2 K3, DEC-ANN-04.
 *
 * Centered modal opened by pressing E on a selected region (selection
 * range exactly equals region.start..region.end). Pre-filled with the
 * region's name, type, coords (1-based UI), and strand. Lets biolog
 * tweak coords precisely — drag-handles (K4) cover ±1 nt nudges, this
 * modal is for typing in the exact value.
 *
 * Backdrop click / Esc → close without effect.
 *
 * Coords convention: store is 0-based exclusive; modal shows 1-based
 * inclusive via toUiCoords; round-trip on submit via fromUiCoords
 * (DEC-ANN-10).
 */

import { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { toUiCoords, fromUiCoords, validateAnnotationCoords } from '../../../lib/annotation-edit.js';

const S = STRINGS.importer.annotationEdit;

const TYPE_OPTIONS = [
  'CDS', 'gene', 'promoter', 'terminator', 'misc_feature',
  'rep_origin', 'RBS', 'enhancer', 'sgRNA', 'primer_bind',
  'protein_bind', 'mobile_element', 'tag',
];

export default function EditAnnotationModal({
  annotation,
  seqLength,
  onCancel,
  onApply,             // ({id, patch}) => void
}) {
  const ui = toUiCoords(annotation.start, annotation.end);
  const [name, setName] = useState(annotation.name || '');
  const [type, setType] = useState(annotation.type || 'misc_feature');
  const [uiStart, setUiStart] = useState(ui.uiStart);
  const [uiEnd, setUiEnd] = useState(ui.uiEnd);
  const [strand, setStrand] = useState(annotation.strand === -1 ? -1 : 1);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); nameRef.current?.select?.(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleApply = () => {
    const { start, end } = fromUiCoords(uiStart, uiEnd);
    const v = validateAnnotationCoords(start, end, seqLength);
    if (!v.valid) {
      setError(v.error || S.createInvalidCoords);
      return;
    }
    onApply?.({
      id: annotation.id,
      patch: {
        name: name.trim(),
        type,
        start,
        end,
        strand: strand === -1 ? -1 : 1,
      },
    });
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div
      data-testid="sequence-view-edit-annotation-backdrop"
      onPointerDown={onCancel}
      onMouseDown={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        data-testid="sequence-view-edit-annotation-modal"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        style={{
          background: 'var(--surface-1, #fff)',
          border: '0.5px solid var(--border-default, #d4d4d4)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          padding: '14px 16px',
          minWidth: 360,
          maxWidth: 420,
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary, #111)' }}>
          {S.editTitle}
        </div>
        <input
          ref={nameRef}
          type="text"
          data-testid="sequence-view-edit-annotation-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApply(); } }}
          style={{
            padding: '5px 8px',
            border: '0.5px solid var(--border-default, #d4d4d4)',
            borderRadius: 'var(--radius-sm, 4px)',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ color: 'var(--text-secondary, #666)' }}>{S.createTypeLabel}</label>
          <select
            data-testid="sequence-view-edit-annotation-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              flex: 1,
              padding: '3px 6px',
              border: '0.5px solid var(--border-default, #d4d4d4)',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: 12,
            }}
          >
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #666)' }}>{S.createStartLabel}</span>
            <input
              type="number"
              data-testid="sequence-view-edit-annotation-start"
              value={uiStart}
              min={1}
              max={seqLength}
              onChange={(e) => setUiStart(parseInt(e.target.value, 10) || 1)}
              style={{ padding: '3px 6px', border: '0.5px solid var(--border-default, #d4d4d4)', borderRadius: 'var(--radius-sm, 4px)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
            />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #666)' }}>{S.createEndLabel}</span>
            <input
              type="number"
              data-testid="sequence-view-edit-annotation-end"
              value={uiEnd}
              min={1}
              max={seqLength}
              onChange={(e) => setUiEnd(parseInt(e.target.value, 10) || 1)}
              style={{ padding: '3px 6px', border: '0.5px solid var(--border-default, #d4d4d4)', borderRadius: 'var(--radius-sm, 4px)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary, #666)' }}>
          <label>
            <input
              type="radio"
              data-testid="sequence-view-edit-annotation-strand-forward"
              checked={strand === 1}
              onChange={() => setStrand(1)}
              style={{ marginRight: 4 }}
            />{S.createStrandForward}
          </label>
          <label>
            <input
              type="radio"
              data-testid="sequence-view-edit-annotation-strand-reverse"
              checked={strand === -1}
              onChange={() => setStrand(-1)}
              style={{ marginRight: 4 }}
            />{S.createStrandReverse}
          </label>
        </div>
        {error ? (
          <div data-testid="sequence-view-edit-annotation-error" style={{ color: 'var(--accent-warn, #c2410c)', fontSize: 11 }}>{error}</div>
        ) : null}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
          <ModalButton onClick={onCancel} data-testid="sequence-view-edit-annotation-cancel">{S.editCancel}</ModalButton>
          <ModalButton onClick={handleApply} primary data-testid="sequence-view-edit-annotation-submit">{S.editApply}</ModalButton>
        </div>
      </div>
    </div>
  );
}

function ModalButton({ onClick, children, primary, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 14px',
        border: '0.5px solid var(--border-default, #d4d4d4)',
        background: primary ? 'var(--accent-500, #f97316)' : 'var(--surface-1, #fff)',
        color: primary ? '#fff' : 'var(--text-primary, #111)',
        fontSize: 12,
        borderRadius: 'var(--radius-sm, 4px)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      {...rest}
    >{children}</button>
  );
}
