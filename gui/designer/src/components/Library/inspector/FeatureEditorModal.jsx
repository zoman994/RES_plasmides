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
import { featureColorShaded } from '../../../feature-palette';
import { shadeFromBaseByIndex } from '../../../lib/color-utils';

const S = STRINGS.importer;

export default function FeatureEditorModal({
  feature,
  seqLength = 0,
  neighbours = [],
  onSave,
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
  // Sub-features (level: 'detail' annotations under this region).
  // Owned by the modal; emitted on Save as `meta.subFeatures`.
  // Each entry: { id?, name, type, start, end, strand, color? }.
  // Biolog «оба фрагмента всё ещё одна фича просто условно
  // субфичи (типо сигнальный пептид в белке)» — split adds a row
  // here without touching the parent annotation.
  const [subFeatures, setSubFeatures] = useState([]);
  // Sprint M-X.3 follow-up — modal got two tabs «Feature» /
  // «Subfeatures». Top-level features (level: 'region') see both;
  // sub-features (level: 'detail') see only the Feature tab so
  // they can't be split into nested grandchildren.
  const [activeTab, setActiveTab] = useState('feature');
  const isSubFeature = feature?.level === 'detail';
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
    // Pre-seed sub-features from the parent's existing detail
    // annotations in `neighbours` (any annotation with
    // level: 'detail' AND regionId === feature.id).
    const existing = (neighbours || []).filter(
      (a) => a && a.level === 'detail' && a.regionId === feature.id,
    );
    setSubFeatures(existing.map((a) => ({
      id: a.id,
      name: a.name || '',
      type: a.type || 'misc_feature',
      start: a.start || 0,
      end: a.end || 0,
      strand: a.strand === -1 ? -1 : 1,
      color: a.color,
    })));
    setActiveTab('feature');
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
    // Sub-features come back as { id?, name, type, start, end,
    // strand, color? }. Numeric coords already in store-space (the
    // row inputs convert from 1-based UI to 0-based store on
    // change). Parent inspector handles the create/update/delete
    // diff against the previous detail set.
    onSave?.({ patch, subFeatures: subFeatures.map((sf) => ({ ...sf })) });
  };

  /**
   * Single «Split» button. First click splits the parent at its
   * midpoint into two halves named «{parentName}-1» / «{parentName}-2».
   * Subsequent clicks halve the LAST sub-feature so biolog can keep
   * adding marker regions without a per-N button.
   *
   * Per biolog «сабфичи должны окрашиваться в схожий цвет но с
   * другим тоном» each child gets a colour shaded from the parent's
   * palette base — same hue family, walking lightness so siblings
   * stay distinguishable. «И они должны наследовать имя родителя
   * только с индексами 1 2 3....n» → name = `${parentName}-${i}`.
   */
  const handleSplit = () => {
    const parentName = (feature?.name && feature.name.trim())
      || feature?.type
      || 'feature';
    const parentBaseColor = featureColorShaded(feature?.type, feature?.name);
    const parentStrand = feature?.strand === -1 ? -1 : 1;
    setSubFeatures((prev) => {
      // Clone for immutable replace.
      const next = [...prev];
      const colorAt = (i) => shadeFromBaseByIndex(parentBaseColor, i);
      if (next.length === 0) {
        const fStart = feature.start || 0;
        const fEnd = feature.end || 0;
        const mid = Math.floor((fStart + fEnd) / 2);
        next.push({
          name: `${parentName}-1`,
          type: feature?.type || 'misc_feature',
          start: fStart, end: mid,
          strand: parentStrand,
          color: colorAt(0),
        });
        next.push({
          name: `${parentName}-2`,
          type: feature?.type || 'misc_feature',
          start: mid, end: fEnd,
          strand: parentStrand,
          color: colorAt(1),
        });
        return next;
      }
      // Halve the last entry.
      const last = next[next.length - 1];
      const lastMid = Math.floor((last.start + last.end) / 2);
      if (lastMid <= last.start || lastMid >= last.end) return next; // too short to halve
      const replacement = { ...last, end: lastMid };
      const fresh = {
        name: `${parentName}-${next.length + 1}`,
        type: feature?.type || last.type || 'misc_feature',
        start: lastMid,
        end: last.end,
        strand: last.strand === -1 ? -1 : 1,
        color: colorAt(next.length),
      };
      next[next.length - 1] = replacement;
      next.push(fresh);
      return next;
    });
  };

  const updateSubFeature = (idx, patch) => {
    setSubFeatures((prev) => prev.map((sf, i) => (i === idx ? { ...sf, ...patch } : sf)));
  };

  const removeSubFeature = (idx) => {
    setSubFeatures((prev) => prev.filter((_, i) => i !== idx));
  };

  // «+ intron» — an intron is just a detail sub-feature of type 'intron' linked
  // to this feature (saved via meta.subFeatures with regionId = feature.id), so
  // the AA track splices it. Seeds a mid-third default; the biolog adjusts the
  // exact coordinates in the sub-feature row that appears above.
  const handleAddIntron = () => {
    const s = Math.max(0, Number(feature?.start) || 0);
    const e = Math.max(s + 1, Number(feature?.end) || s + 1);
    const len = e - s;
    const iStart = s + Math.floor(len / 3);
    const iEnd = Math.min(e, Math.max(iStart + 1, s + Math.floor((2 * len) / 3)));
    setSubFeatures((prev) => [...prev, {
      name: `интрон ${prev.filter((x) => x.type === 'intron').length + 1}`,
      type: 'intron',
      start: iStart,
      end: iEnd,
      strand: feature?.strand === -1 ? -1 : 1,
    }]);
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
        <Header isSubFeature={isSubFeature} onClose={onClose} />

        {/* Tab bar — hidden for sub-features (they can't have nested
            grandchildren, so the «Subfeatures» tab makes no sense). */}
        {!isSubFeature && (
          <div
            data-testid="feature-editor-tabs"
            style={{
              display: 'flex',
              borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
              padding: '0 12px',
            }}
          >
            <TabButton
              testid="feature-editor-tab-feature"
              active={activeTab === 'feature'}
              onClick={() => setActiveTab('feature')}
            >{S.featureEditorTabFeature}</TabButton>
            <TabButton
              testid="feature-editor-tab-subfeatures"
              active={activeTab === 'subfeatures'}
              onClick={() => setActiveTab('subfeatures')}
            >{S.featureEditorTabSubfeatures(subFeatures.length)}</TabButton>
          </div>
        )}

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* «Feature» tab body — name / type / coords / strand /
              merge. Always rendered for sub-feature mode (no tabs). */}
          {(isSubFeature || activeTab === 'feature') && (
            <>
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
            </>
          )}

          {/* «Subfeatures» tab body — only for top-level features.
              Hidden entirely for level: 'detail' so children can't be
              split into nested grandchildren. */}
          {!isSubFeature && activeTab === 'subfeatures' && (
            <>
              <Field label={S.featureEditorSubfeaturesLabel}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subFeatures.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {S.featureEditorNoSubfeatures}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {subFeatures.map((sf, i) => (
                        <SubFeatureRow
                          key={sf.id || `sf-${i}`}
                          subFeature={sf}
                          onChange={(patch) => updateSubFeature(i, patch)}
                          onDelete={() => removeSubFeature(i)}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    data-testid="feature-editor-split"
                    onClick={handleSplit}
                    style={{ ...secondaryBtnStyle(), alignSelf: 'flex-start' }}
                    title={S.featureEditorSplitHint}
                  >+ {S.featureEditorSplit}</button>
                </div>
              </Field>

              <Field label={S.featureEditorIntronsLabel}>
                <div data-testid="feature-editor-introns" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    data-testid="feature-editor-add-intron"
                    onClick={handleAddIntron}
                    style={{ ...secondaryBtnStyle(), alignSelf: 'flex-start' }}
                  >
                    + intron
                  </button>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                    интрон вырезается из рамки CDS — координаты правятся в строке субфичи выше
                  </span>
                </div>
              </Field>
            </>
          )}
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

function Header({ isSubFeature, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 12,
      padding: '12px 16px',
      borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{S.featureEditorTitle}</div>
      <span
        data-testid="feature-editor-level-badge"
        style={{
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 8,
          background: isSubFeature
            ? 'rgba(155, 89, 182, 0.15)'
            : 'var(--surface-2, #f5f5f4)',
          color: isSubFeature
            ? 'rgb(125, 60, 152)'
            : 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 500,
        }}
      >{isSubFeature ? S.featureEditorLevelDetail : S.featureEditorLevelRegion}</span>
      <span style={{ flex: 1 }} />
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

function TabButton({ active, onClick, testid, children }) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      style={{
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        color: active ? 'var(--accent-500, #f97316)' : 'var(--text-secondary)',
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--accent-500, #f97316)'
          : '2px solid transparent',
        cursor: 'pointer',
        outline: 'none',
        marginBottom: -0.5,
      }}
    >{children}</button>
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

/**
 * One sub-feature row inside the FeatureEditorModal — name + type
 * + start/end + delete. Coords are 1-based UI; the change handler
 * normalises them to 0-based store coords on the way out so the
 * modal's outgoing meta uses the canonical convention.
 */
function SubFeatureRow({ subFeature, onChange, onDelete }) {
  return (
    <div
      data-testid="feature-editor-subfeature-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 70px 70px 24px',
        gap: 4,
        alignItems: 'center',
      }}
    >
      <input
        data-testid="subfeature-name"
        type="text"
        value={subFeature.name || ''}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={S.featureEditorSubfeatureNamePlaceholder}
        style={inputStyle()}
      />
      <select
        data-testid="subfeature-type"
        value={subFeature.type || 'misc_feature'}
        onChange={(e) => onChange({ type: e.target.value })}
        style={{ ...inputStyle(), padding: '4px 6px' }}
      >
        {PART_TYPE_GROUPS.map((g) => (
          <optgroup key={g.labelKey} label={g.labelKey.replace('typegroup.', '')}>
            {g.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        ))}
      </select>
      <input
        data-testid="subfeature-start"
        type="number"
        // 1-based UI display: store start + 1.
        value={String((subFeature.start || 0) + 1)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          onChange({ start: Math.max(0, v - 1) });
        }}
        style={{ ...inputStyle(), padding: '4px 6px' }}
        min={1}
      />
      <input
        data-testid="subfeature-end"
        type="number"
        value={String(subFeature.end || 0)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          onChange({ end: Math.max(0, v) });
        }}
        style={{ ...inputStyle(), padding: '4px 6px' }}
        min={1}
      />
      <button
        type="button"
        data-testid="subfeature-delete"
        onClick={onDelete}
        title="Remove"
        style={{
          fontSize: 11, padding: '4px 0',
          background: 'transparent',
          color: 'rgb(220, 38, 38)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-sm, 3px)',
          cursor: 'pointer',
        }}
      >{S.featureEditorSubfeatureDelete}</button>
    </div>
  );
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
