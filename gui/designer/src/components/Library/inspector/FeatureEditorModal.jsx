/** Canonical feature/location editor shared by Library and Container. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { PART_TYPE_GROUPS } from '../../AnnotationEditor';
import { featureColorShaded } from '../../../feature-palette';
import { shadeFromBaseByIndex } from '../../../lib/color-utils';
import {
  LOCATION_KINDS,
  toUiSegments,
  fromUiSegment,
  getSegments,
  makeLocation,
  normalizeLocation,
} from '../../../lib/annotation-location';
import FeatureLocationEditor from './FeatureLocationEditor';
import { Icon } from '../../icons/Icon';

const S = STRINGS.importer;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function FeatureEditorModal({
  feature,
  seqLength = 0,
  // The current document's topology — an origin crossing is minted only when it
  // is 'circular'. Unknown/absent stays linear so a wrap is never invented.
  topology = 'linear',
  neighbours = [],
  onSave,
  onMerge,
  onDelete,
  onClose,
}) {
  // Form state — re-seeded each time `feature.id` changes.
  const [name, setName] = useState('');
  const [type, setType] = useState('CDS');
  const [uiSegments, setUiSegments] = useState([{ uiStart: '1', uiEnd: '1' }]);
  const [locationKind, setLocationKind] = useState(LOCATION_KINDS.SINGLE);
  const [locationError, setLocationError] = useState(null);
  const [strand, setStrand] = useState(1);
  const [mergePick, setMergePick] = useState(null);
  const [subFeatures, setSubFeatures] = useState([]);
  const [activeTab, setActiveTab] = useState('feature');
  const isSubFeature = feature?.level === 'detail';
  const isCompoundFeature = feature ? getSegments(feature).length > 1 : false;
  const compoundOperationsBlocked = isCompoundFeature || uiSegments.length > 1;
  const nameRef = useRef(null);
  const modalRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const featureKey = feature ? (feature.id || `${feature.start}:${feature.end}`) : null;
  useEffect(() => {
    if (!feature) return;
    setName(feature.name || '');
    setType(feature.type || 'CDS');
    // Seed ordered 1-based inclusive segment rows from the canonical location
    // (or the scalar projection for a legacy feature).
    const ui = toUiSegments(feature);
    setUiSegments(ui.length
      ? ui.map((s) => ({ uiStart: String(s.uiStart), uiEnd: String(s.uiEnd) }))
      : [{ uiStart: '1', uiEnd: '1' }]);
    setLocationKind(feature.location?.kind
      || (ui.length > 1 ? LOCATION_KINDS.JOIN : LOCATION_KINDS.SINGLE));
    setLocationError(null);
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
      isCompound: getSegments(a).length > 1,
    })));
    setActiveTab('feature');
  }, [featureKey]); // eslint-disable-line react-hooks/exhaustive-deps -- featureKey is the gate

  useEffect(() => {
    if (!feature) return undefined;
    restoreFocusRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !modalRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !modalRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [featureKey]);

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
    if (!feature || compoundOperationsBlocked) return [];
    return (neighbours || []).filter((n) => {
      if (!n || n.id === feature.id || getSegments(n).length > 1) return false;
      return n.end === feature.start || n.start === feature.end;
    });
  }, [feature, neighbours, compoundOperationsBlocked]);

  if (!feature) return null;

  const onChangeSegment = (idx, patch) => {
    setLocationError(null);
    setUiSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const onAddSegment = () => {
    setLocationError(null);
    setUiSegments((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, last ? { uiStart: last.uiEnd, uiEnd: last.uiEnd } : { uiStart: '1', uiEnd: '1' }];
    });
    setLocationKind((k) => (k === LOCATION_KINDS.ORDER ? k : LOCATION_KINDS.JOIN));
  };
  const onRemoveSegment = (idx) => {
    setLocationError(null);
    setUiSegments((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleSave = () => {
    const patch = {
      name: name.trim() || feature.name,
      type,
      strand: strand === -1 ? -1 : 1,
    };
    let nextSegments;
    let location;
    try {
      nextSegments = uiSegments.map((s) => fromUiSegment(Number(s.uiStart), Number(s.uiEnd)));
      const kind = nextSegments.length > 1
        ? (locationKind === LOCATION_KINDS.ORDER ? LOCATION_KINDS.ORDER : LOCATION_KINDS.JOIN)
        : LOCATION_KINDS.SINGLE;
      location = makeLocation(kind, nextSegments);
      normalizeLocation({ location }, { length: seqLength, topology });
    } catch (err) {
      setLocationError(locationErrorMessage(err));
      return;
    }
    if (!segmentsEqual(nextSegments, getSegments(feature))) patch.location = location;
    setLocationError(null);
    // Sub-features come back as { id?, name, type, start, end, strand, color? }.
    // The parent reconciles them through the collision/cascade-safe core paths.
    onSave?.({ patch, subFeatures: subFeatures.map((sf) => ({ ...sf })) });
  };

  const handleSplit = () => {
    if (compoundOperationsBlocked) return;
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

  const handleAddIntron = () => {
    if (compoundOperationsBlocked) return;
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
    if (!mergePick || compoundOperationsBlocked) return;
    if (onMerge?.(mergePick) !== false) onClose?.();
  };

  const handleDelete = () => {
    onDelete?.();
    onClose?.();
  };

  return (
    <div
      data-testid="feature-editor-backdrop"
      data-modal-open=""
      data-block-global-hotkeys="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-editor-title"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        ref={modalRef}
        data-testid="feature-editor-modal"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
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
                <FeatureLocationEditor
                  segments={uiSegments}
                  onChangeSegment={onChangeSegment}
                  onAddSegment={onAddSegment}
                  onRemoveSegment={onRemoveSegment}
                  allowCompound={!isSubFeature}
                  error={locationError}
                />
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
                    disabled={compoundOperationsBlocked}
                    style={{
                      ...secondaryBtnStyle(),
                      alignSelf: 'flex-start',
                      opacity: compoundOperationsBlocked ? 0.5 : 1,
                      cursor: compoundOperationsBlocked ? 'not-allowed' : 'pointer',
                    }}
                    title={S.featureEditorSplitHint}
                  >+ {S.featureEditorSplit}</button>
                  {compoundOperationsBlocked && (
                    <span
                      data-testid="feature-editor-compound-ops-note"
                      style={{ fontSize: 9, color: 'var(--text-tertiary)' }}
                    >{S.featureEditorCompoundOpsDisabled}</span>
                  )}
                </div>
              </Field>

              <Field label={S.featureEditorIntronsLabel}>
                <div data-testid="feature-editor-introns" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    data-testid="feature-editor-add-intron"
                    onClick={handleAddIntron}
                    disabled={compoundOperationsBlocked}
                    style={{
                      ...secondaryBtnStyle(),
                      alignSelf: 'flex-start',
                      opacity: compoundOperationsBlocked ? 0.5 : 1,
                      cursor: compoundOperationsBlocked ? 'not-allowed' : 'pointer',
                    }}
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
      <div id="feature-editor-title" style={{ fontSize: 14, fontWeight: 500 }}>
        {S.featureEditorTitle}
      </div>
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
        data-testid="feature-editor-close"
        onClick={onClose}
        aria-label="close"
        style={{
          fontSize: 14, padding: '0 6px',
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: 'none', cursor: 'pointer',
        }}
      ><Icon name="close" size={14} /></button>
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
        disabled={subFeature.isCompound}
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
        disabled={subFeature.isCompound}
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
      ><Icon name="close" size={14} /></button>
      {subFeature.isCompound && (
        <span
          data-testid="subfeature-compound-note"
          style={{ gridColumn: '3 / -1', fontSize: 9, color: 'var(--text-tertiary)' }}
        >{S.featureEditorCompoundChildCoordsReadOnly}</span>
      )}
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

/** Deep equality of two ordered `{start,end}` segment lists. */
function segmentsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].start !== b[i].start || a[i].end !== b[i].end) return false;
  }
  return true;
}

/** Map a core location error to a friendly inline message. */
function locationErrorMessage(err) {
  return /circular topology/i.test(String(err?.message || ''))
    ? S.featureEditorLocationErrorLinearWrap
    : S.featureEditorLocationErrorInvalid;
}
