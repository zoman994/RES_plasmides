/**
 * CreateAnnotationPopup — Sprint M-X.2 K3, DEC-ANN-03.
 *
 * Quick-create form opened by selection + H (or via the right-click
 * context menu). Floating popup positioned near the right edge of the
 * current selection. Auto-focuses the Name field on mount.
 *
 * Three equal-weight buttons (per Igor's kickoff Q4):
 *   [Отмена]            close, no effect
 *   [Найти в Аннотаторе] openAnnotator scope=region (K9 wires this)
 *   [Создать]            applyAnnotationEdit kind='create'
 *
 * Outside-click / Esc → close without effect. Stop propagation on
 * pointer events (same trick as SelectionContextMenu) — without it
 * the SequenceView root would collapse the selection on the very
 * pointerdown that opened the popup.
 *
 * Coords: pre-filled in 1-based inclusive UI form via toUiCoords;
 * conversion back to store on submit via fromUiCoords (DEC-ANN-10).
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

export default function CreateAnnotationPopup({
  position,           // { x, y } — anchor in viewport coords
  selectionStart,     // store coords (0-based exclusive end)
  selectionEnd,
  seqLength,
  onCancel,
  onCreate,           // ({name, type, start, end, strand}) => void
  onOpenAnnotator,    // ({start, end}) => void — K3 wires the action
}) {
  const ui = toUiCoords(selectionStart, selectionEnd);
  const [name, setName] = useState('');
  const [type, setType] = useState('CDS');
  const [uiStart, setUiStart] = useState(ui.uiStart);
  const [uiEnd, setUiEnd] = useState(ui.uiEnd);
  const [strand, setStrand] = useState(1);
  const [error, setError] = useState('');
  const nameRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select?.();
  }, []);

  // Outside-click + Esc.
  useEffect(() => {
    const onDocPointer = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onCancel?.();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  const handleCreate = () => {
    const start = fromUiCoords(uiStart, uiEnd).start;
    const end = fromUiCoords(uiStart, uiEnd).end;
    const v = validateAnnotationCoords(start, end, seqLength);
    if (!v.valid) {
      setError(v.error || S.createInvalidCoords);
      return;
    }
    onCreate?.({
      name: name.trim(),
      type,
      start,
      end,
      strand: strand === -1 ? -1 : 1,
    });
  };

  const handleOpenAnnotator = () => {
    const start = fromUiCoords(uiStart, uiEnd).start;
    const end = fromUiCoords(uiStart, uiEnd).end;
    onOpenAnnotator?.({ start, end });
  };

  const stop = (e) => e.stopPropagation();

  // Position with viewport bounds so we don't overflow.
  const left = Math.max(8, Math.min((position?.x || 0), (window.innerWidth || 1024) - 320));
  const top = Math.max(8, Math.min((position?.y || 0), (window.innerHeight || 768) - 280));

  return (
    <div
      ref={popupRef}
      data-testid="sequence-view-create-annotation-popup"
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left,
        top,
        background: 'var(--surface-1, #fff)',
        border: '0.5px solid var(--border-default, #d4d4d4)',
        borderRadius: 'var(--radius-md, 6px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        padding: '10px 12px',
        minWidth: 280,
        maxWidth: 320,
        zIndex: 100,
        fontSize: 12,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 500, color: 'var(--text-primary, #111)' }}>
        {S.createTitle}
      </div>
      <input
        ref={nameRef}
        type="text"
        data-testid="sequence-view-create-annotation-name"
        placeholder={S.createNamePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
        }}
        style={{
          padding: '4px 8px',
          border: '0.5px solid var(--border-default, #d4d4d4)',
          borderRadius: 'var(--radius-sm, 4px)',
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ flexShrink: 0, color: 'var(--text-secondary, #666)' }}>{S.createTypeLabel}</label>
        <select
          data-testid="sequence-view-create-annotation-type"
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
            data-testid="sequence-view-create-annotation-start"
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
            data-testid="sequence-view-create-annotation-end"
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
            data-testid="sequence-view-create-annotation-strand-forward"
            checked={strand === 1}
            onChange={() => setStrand(1)}
            style={{ marginRight: 4 }}
          />{S.createStrandForward}
        </label>
        <label>
          <input
            type="radio"
            data-testid="sequence-view-create-annotation-strand-reverse"
            checked={strand === -1}
            onChange={() => setStrand(-1)}
            style={{ marginRight: 4 }}
          />{S.createStrandReverse}
        </label>
      </div>
      {error ? (
        <div data-testid="sequence-view-create-annotation-error" style={{ color: 'var(--accent-warn, #c2410c)', fontSize: 11 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
        <PopupButton onClick={onCancel} data-testid="sequence-view-create-annotation-cancel">
          {S.createCancel}
        </PopupButton>
        <PopupButton onClick={handleOpenAnnotator} data-testid="sequence-view-create-annotation-open-annotator">
          {S.createOpenAnnotator}
        </PopupButton>
        <PopupButton onClick={handleCreate} primary data-testid="sequence-view-create-annotation-submit">
          {S.createSubmit}
        </PopupButton>
      </div>
    </div>
  );
}

function PopupButton({ onClick, children, primary, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        border: '0.5px solid var(--border-default, #d4d4d4)',
        background: primary ? 'var(--accent-500, #f97316)' : 'var(--surface-1, #fff)',
        color: primary ? '#fff' : 'var(--text-primary, #111)',
        fontSize: 11,
        borderRadius: 'var(--radius-sm, 4px)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      {...rest}
    >{children}</button>
  );
}
