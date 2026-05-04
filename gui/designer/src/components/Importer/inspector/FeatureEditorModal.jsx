/**
 * FeatureEditorModal — Sprint M-X.3 follow-up.
 *
 * Opens on double-click of a feature in the SequenceView (replaces
 * the previous «dblclick → open Annotator» wire). Surfaces the
 * single-feature edit toolkit per biolog «двойной клик на фичу не
 * должен кидать в аннотатор. Он должен кидать в отдельную модалку,
 * которая
 *   1) даёт возможность разбить фичу на N кусков и слить с
 *      соседними,
 *   2) выбрать тип фичи,
 *   3) переименование, разметка интронов (заглушка), изменение
 *      координат каждого куска».
 *
 * Form layout:
 *   ┌──────────────────────────────────┐
 *   │ Edit feature                  [✕]│
 *   ├──────────────────────────────────┤
 *   │ NAME       [_________________]   │
 *   │ TYPE       [CDS ▼]               │
 *   │ COORDS     Start [___] End [___] │
 *   │ STRAND     ◉ +   ○ −             │
 *   │ ─── Operations ───               │
 *   │ [Split into 2] [3] [4]           │
 *   │ Merge with:                      │
 *   │   ◉ ← Plefty                     │
 *   │   ○ Trighty →                    │
 *   │   [Apply merge]                  │
 *   │ INTRONS    (stub — coming soon)  │
 *   ├──────────────────────────────────┤
 *   │ [Delete]      [Cancel] [Save]    │
 *   └──────────────────────────────────┘
 *
 * Stateless about WHERE the feature lives — the parent
 * (SingleInspector) wires the four callbacks to the existing
 * `applyAnnotationEdit` dispatcher + a small split / merge helper.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { PART_TYPE_GROUPS } from '../../AnnotationEditor';

const S = STRINGS.importer;

export default function FeatureEditorModal({
  feature,
  seqLength = 0,
  neighbours = [],
  onSave,
  onSplit,
  onMerge,
  onDelete,
  onClose,
}) {
  // Form state — re-seeded each time `feature.id` changes.
  const [name, setName] = useState('');
  const [type, setType] = useState('CDS');
  const [start, setStart] = useState('1'); // 1-based UI
  const [end, setEnd] = useState('1');
  const [strand, setStrand] = useState(1);
  const [mergePick, setMergePick] = useState(null);
  const nameRef = useRef(null);

  const featureKey = feature ? (feature.id || `${feature.start}:${feature.end}`) : null;
  useEffect(() => {
    if (!feature) return;
    setName(feature.name || '');
    setType(feature.type || 'CDS');
    setStart(String((feature.start || 0) + 1));
    setEnd(String(feature.end || 0));
    setStrand(feature.strand === -1 ? -1 : 1);
    setMergePick(null);
  }, [featureKey]); // eslint-disable-line react-hooks/exhaustive-deps -- featureKey is the gate

  // Esc closes — bound only while the modal is open. Listener runs
  // in CAPTURE phase + calls stopPropagation so the App-level
  // global Escape hotkey (`navStack.length > 1 → popFullscreen`)
  // can't also fire and dump biolog out of the Importer back to
  // Start. Biolog «из модалки этих фичес на эскейп выбрасывает из
  // библиотеки совсем».
  useEffect(() => {
    if (!feature) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [feature, onClose]);

  useEffect(() => {
    if (feature && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [featureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adjacent neighbours = features whose end equals this.start
  // (left) or whose start equals this.end (right). Other features
  // are dropped — biolog wants merge to refuse non-touching
  // candidates so accidental merges across gaps don't happen.
  const adjacent = useMemo(() => {
    if (!feature) return [];
    return (neighbours || []).filter((n) => {
      if (!n || n.id === feature.id) return false;
      return n.end === feature.start || n.start === feature.end;
    });
  }, [feature, neighbours]);

  if (!feature) return null;

  const handleSave = () => {
    const startUi = Number(start);
    const endStore = Number(end);
    const startStore = Number.isFinite(startUi) ? Math.max(0, startUi - 1) : feature.start;
    const patch = {
      name: name.trim() || feature.name,
      type,
      start: startStore,
      end: Number.isFinite(endStore) ? Math.max(startStore + 1, Math.min(seqLength || endStore, endStore)) : feature.end,
      strand: strand === -1 ? -1 : 1,
    };
    onSave?.({ patch });
  };

  const handleSplit = (n) => {
    onSplit?.(n);
    onClose?.();
  };

  const handleMerge = () => {
    if (!mergePick) return;
    onMerge?.(mergePick);
    onClose?.();
  };

  const handleDelete = () => {
    onDelete?.();
    onClose?.();
  };

  return (
    <div
      data-testid="feature-editor-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        data-testid="feature-editor-modal"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--surface-1, #fff)',
          color: 'var(--text-primary, #111)',
          border: '0.5px solid var(--border-default, #d4d4d4)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <Header onClose={onClose} />

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={S.featureEditorNameLabel}>
            <input
              ref={nameRef}
              data-testid="feature-editor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label={S.featureEditorTypeLabel}>
            <select
              data-testid="feature-editor-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{ ...inputStyle(), padding: '4px 6px' }}
            >
              {PART_TYPE_GROUPS.map((g) => (
                <optgroup key={g.labelKey} label={g.labelKey.replace('typegroup.', '')}>
                  {g.types.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label={S.featureEditorCoordsLabel}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{S.featureEditorCoordsStart}</span>
              <input
                data-testid="feature-editor-start"
                type="number"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={{ ...inputStyle(), width: 90 }}
                min={1}
              />
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{S.featureEditorCoordsEnd}</span>
              <input
                data-testid="feature-editor-end"
                type="number"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ ...inputStyle(), width: 90 }}
                min={1}
              />
            </div>
          </Field>

          <Field label={S.featureEditorStrandLabel}>
            <div style={{ display: 'flex', gap: 6 }}>
              <ToggleBtn
                data-testid="feature-editor-strand-fwd"
                active={strand === 1} onClick={() => setStrand(1)}
              >{S.featureEditorStrandFwd}</ToggleBtn>
              <ToggleBtn
                data-testid="feature-editor-strand-rev"
                active={strand === -1} onClick={() => setStrand(-1)}
              >{S.featureEditorStrandRev}</ToggleBtn>
            </div>
          </Field>

          <Divider label={S.featureEditorOperationsLabel} />

          <Field label="Split">
            <div style={{ display: 'flex', gap: 6 }}>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid={`feature-editor-split-${n}`}
                  onClick={() => handleSplit(n)}
                  style={secondaryBtnStyle()}
                  title={S.featureEditorSplitHint}
                >{S.featureEditorSplit(n)}</button>
              ))}
            </div>
          </Field>

          <Field label={S.featureEditorMergeLabel}>
            {adjacent.length === 0 ? (
              <div
                data-testid="feature-editor-merge-empty"
                style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
              >{S.featureEditorMergeNone}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {adjacent.map((n) => (
                  <label
                    key={n.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    <input
                      type="radio"
                      name="merge-pick"
                      data-testid={`feature-editor-merge-${n.id}`}
                      checked={mergePick === n.id}
                      onChange={() => setMergePick(n.id)}
                    />
                    {n.end === feature.start
                      ? S.featureEditorMergePrev(n.name)
                      : S.featureEditorMergeNext(n.name)}
                  </label>
                ))}
                <button
                  type="button"
                  data-testid="feature-editor-merge-apply"
                  onClick={handleMerge}
                  disabled={!mergePick}
                  style={{
                    ...secondaryBtnStyle(),
                    opacity: mergePick ? 1 : 0.5,
                    cursor: mergePick ? 'pointer' : 'not-allowed',
                    alignSelf: 'flex-start',
                  }}
                >{S.featureEditorMergeApply}</button>
              </div>
            )}
          </Field>

          <Field label={S.featureEditorIntronsLabel}>
            <div data-testid="feature-editor-introns" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button type="button" disabled style={{ ...secondaryBtnStyle(), opacity: 0.55, cursor: 'not-allowed', alignSelf: 'flex-start' }}>
                + intron
              </button>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{S.featureEditorIntronsStub}</span>
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', gap: 8, alignItems: 'center',
            padding: '10px 16px',
            borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
            background: 'var(--surface-2, #f5f5f4)',
          }}
        >
          <button
            type="button"
            data-testid="feature-editor-delete"
            onClick={handleDelete}
            style={{
              ...secondaryBtnStyle(),
              color: 'rgb(220, 38, 38)',
              borderColor: 'rgba(220, 38, 38, 0.4)',
            }}
          >{S.featureEditorDelete}</button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="feature-editor-cancel"
            onClick={onClose}
            style={secondaryBtnStyle()}
          >{S.featureEditorCancel}</button>
          <button
            type="button"
            data-testid="feature-editor-save"
            onClick={handleSave}
            style={{
              fontSize: 12, padding: '6px 16px',
              background: 'var(--accent-500, #f97316)',
              color: '#fff', border: 'none',
              borderRadius: 'var(--radius-sm, 3px)',
              cursor: 'pointer', fontWeight: 500,
            }}
          >{S.featureEditorSave}</button>
        </div>
      </div>
    </div>
  );
}

function Header({ onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 12,
      padding: '12px 16px',
      borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{S.featureEditorTitle}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        style={{
          fontSize: 14, padding: '0 6px',
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: 'none', cursor: 'pointer',
        }}
      >✕</button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
      }}>{label}</span>
      {children}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      paddingTop: 4, marginTop: 4,
      borderTop: '0.5px solid var(--border-subtle)',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
      }}>{label}</span>
    </div>
  );
}

function ToggleBtn({ active, onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? 'true' : 'false'}
      style={{
        flex: 1, fontSize: 12, padding: '6px 10px',
        background: active ? 'var(--accent-500, #f97316)' : 'transparent',
        color: active ? '#fff' : 'var(--text-primary)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-sm, 3px)',
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
      }}
      {...rest}
    >{children}</button>
  );
}

function inputStyle() {
  return {
    fontSize: 12, padding: '5px 8px',
    background: 'var(--surface-1, #fff)',
    color: 'var(--text-primary, #111)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 3px)',
    outline: 'none', width: '100%',
  };
}

function secondaryBtnStyle() {
  return {
    fontSize: 11, padding: '5px 10px',
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 3px)',
    cursor: 'pointer',
  };
}
