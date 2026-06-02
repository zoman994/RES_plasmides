/**
 * CommonFeaturesPanel — Library section for browsing + editing the
 * common-features DB (SPEC_COMMON_FEATURES DEC-CF-06/10/12). Master = the
 * merged list (factory + user overlay) with provenance badge + search;
 * clicking a row selects it. Detail = inline name/type header fields +
 * LinearFeatureBar (колбаса) + an EDITABLE SequenceView over a synthesized
 * single-region fragment of the selected feature.
 *
 * Always-editable (DEC-CF-12, Пачка 3): there is no separate «Edit» mode —
 * the biolog edits the DNA right in the viewer (типы/Delete; navigation
 * doesn't mutate) and the name/type via the header inputs. The first edit of
 * a factory feature creates an override (DEC-CF-03 path); reset-to-factory on
 * overridden rows, delete on user rows. Store updates immediately; the Dexie
 * write is debounced (editCommonFeature). The old lean §9-B textarea editor
 * is gone.
 *
 * NOT LibrarySingleInspector wholesale (no tabs/history/save-flow/primers);
 * coords/strand/split к референс-записи неприменимы → onAnnotationEdit is NOT
 * wired. NOT a drag source (DEC-CF-07).
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore, selectMergedCommonFeatures } from '../../../store';
import { flushCommonFeatureWrites } from '../../../store/commonFeaturesSlice';
import { loadFeatureDB } from '../../../feature-detection';
import { translateDNA } from '../../../codons';
import { STRINGS } from '../../../lib/strings';
import { useSequenceSelection } from '../../../hooks/useSequenceSelection';
import { applySequenceEditToEntry } from '../lib/library-sequence-edit';
import SequenceView from '../../SequenceView';
import LinearFeatureBar from '../inspector/tabs/LinearFeatureBar';

const S = STRINGS.commonFeatures;

const TYPE_OPTIONS = [
  'CDS', 'marker', 'reporter', 'promoter', 'terminator', 'rep_origin',
  'primer_bind', 'protein_bind', 'RBS', 'polyA_signal', 'enhancer',
  'LTR', 'sig_peptide', 'misc_feature',
];

const PROTEIN_TYPES = new Set(['CDS', 'marker', 'reporter']);

const BADGE = {
  factory: { label: S.badgeFactory, bg: 'var(--surface-2)', fg: 'var(--text-secondary)' },
  user: { label: S.badgeUser, bg: 'var(--accent-wash, rgba(184,92,62,0.12))', fg: 'var(--accent-700, #8a3a22)' },
  overridden: { label: S.badgeOverridden, bg: 'var(--warning-bg, #fffbeb)', fg: 'var(--warning-text, #92400e)' },
};

function keyOf(f) {
  return f.origin === 'user' ? f.id : f.baseId;
}

// Keep the stored protein consistent with the edited DNA so the record still
// detects via the protein pathway (or drops to DNA when the type is non-coding).
function proteinFor(type, sequence) {
  if (!PROTEIN_TYPES.has(type)) return null;
  const p = translateDNA(String(sequence || '')).replace(/\*+$/, '');
  return p.length >= 10 ? p : null;
}

export default function CommonFeaturesPanel() {
  const overlay = useStore((s) => s.commonFeatures);
  const resetCommonFeature = useStore((s) => s.resetCommonFeature);
  const deleteUserFeature = useStore((s) => s.deleteUserFeature);
  const editCommonFeature = useStore((s) => s.editCommonFeature);

  const [builtin, setBuiltin] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [confirming, setConfirming] = useState(null); // 'reset' | 'delete'

  useEffect(() => {
    let cancelled = false;
    loadFeatureDB()
      .then((db) => { if (!cancelled) setBuiltin(db?.features || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Flush any pending debounced edit-writes when the panel unmounts.
  useEffect(() => () => { flushCommonFeatureWrites(); }, []);

  const merged = useMemo(
    () => selectMergedCommonFeatures({ commonFeatures: overlay }, builtin),
    [overlay, builtin],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (f) => (f.name || '').toLowerCase().includes(q) || (f.type || '').toLowerCase().includes(q),
    );
  }, [merged, query]);

  const selected = useMemo(
    () => merged.find((f) => keyOf(f) === selectedKey) || null,
    [merged, selectedKey],
  );

  // Controlled caret — shared hook (resets on feature switch via resetKey).
  const sel = useSequenceSelection({ resetKey: selectedKey });

  // Synthesized single-region fragment (DEC-CF-10) — rebuilt from the record
  // each render so the full-span region annotation tracks the edited length.
  const detailFragment = useMemo(() => {
    if (!selected) return null;
    const seq = (selected.sequence || '').toUpperCase();
    return {
      id: `cf-${selectedKey}`,
      name: selected.name || '(unnamed)',
      sequence: seq,
      annotations: seq ? [{
        id: `cf-region-${selectedKey}`,
        start: 0,
        end: seq.length,
        name: selected.name || '(unnamed)',
        type: selected.type || 'misc_feature',
        level: 'region',
        strand: 1,
      }] : [],
      type: 'misc_feature',
      strand: 1,
    };
  }, [selected, selectedKey]);

  const selectFeature = (f) => { setConfirming(null); setSelectedKey(keyOf(f)); };

  // Single edit dispatcher — merges the changed field into the record, keeps
  // protein consistent, and routes to editCommonFeature (factory→override /
  // user-update; store immediate, Dexie debounced).
  const applyEdit = (changes) => {
    if (!selected) return;
    const name = changes.name !== undefined ? changes.name : (selected.name || '');
    const type = changes.type !== undefined ? changes.type : (selected.type || 'misc_feature');
    const sequence = changes.sequence !== undefined ? changes.sequence : (selected.sequence || '');
    editCommonFeature(selected, {
      name, type, sequence, length: sequence.length, protein: proteinFor(type, sequence),
    });
  };

  // onSequenceEdit op (insert/delete/replace) → next sequence + caret, via the
  // same pure applier the Library editor uses.
  const handleSequenceEdit = (op) => {
    if (!selected) return;
    const res = applySequenceEditToEntry(
      { payload: { sequence: selected.sequence || '', annotations: [] } }, op,
    );
    if (!res || !res.ok) return;
    applyEdit({ sequence: res.sequence });
    if (Number.isFinite(res.caretAfter)) {
      sel.setCaretPos(res.caretAfter);
      sel.setCaretAnchor(res.caretAfter);
    }
  };

  const doConfirm = async () => {
    if (!selected || !confirming) return;
    if (confirming === 'reset') await resetCommonFeature(selected.baseId);
    else if (confirming === 'delete') { await deleteUserFeature(selected.id); setSelectedKey(null); }
    setConfirming(null);
  };

  const seqLen = detailFragment ? detailFragment.sequence.length : 0;
  const badge = selected ? (BADGE[selected.origin] || BADGE.factory) : null;

  return (
    <div data-testid="common-features-panel" style={{ display: 'flex', minHeight: 0, height: '100%', background: 'var(--surface-1)' }}>
      {/* ── Master ──────────────────────────────────────────────── */}
      <div style={{ width: 312, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border-subtle)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{S.sectionTitle}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{S.countLabel(merged.length)}</span>
          </div>
          <input
            type="text"
            data-testid="common-features-search"
            placeholder={S.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ height: 28, padding: '0 10px', fontSize: 12, background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none' }}
          />
        </div>
        <div data-testid="common-features-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div data-testid="common-features-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>{S.empty}</div>
          ) : filtered.map((f) => {
            const k = keyOf(f);
            const b = BADGE[f.origin] || BADGE.factory;
            const active = k === selectedKey;
            return (
              <button
                type="button"
                key={k}
                data-testid={`common-feature-row-${k}`}
                aria-pressed={active}
                onClick={() => selectFeature(f)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', borderBottom: '0.5px solid var(--border-subtle)', cursor: 'pointer', background: active ? 'var(--accent-wash, rgba(184,92,62,0.10))' : 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</span>
                    <span data-testid={`common-feature-badge-${k}`} data-origin={f.origin} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: b.bg, color: b.fg, textTransform: 'uppercase', letterSpacing: 0.3 }}>{b.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{f.type} · {S.lengthLabel(f.length || f.sequence?.length || 0)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail ──────────────────────────────────────────────── */}
      <div data-testid="common-features-detail" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!selected ? (
          <div data-testid="common-features-detail-hint" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: 32 }}>{S.selectHint}</div>
        ) : (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    data-testid="common-feature-name-input"
                    aria-label={S.fieldName}
                    value={selected.name || ''}
                    onChange={(e) => applyEdit({ name: e.target.value })}
                    style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, padding: '3px 6px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none' }}
                  />
                  <span data-testid="common-features-detail-badge" data-origin={selected.origin} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: badge.bg, color: badge.fg, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 }}>{badge.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    data-testid="common-feature-type-select"
                    aria-label={S.fieldType}
                    value={selected.type || 'misc_feature'}
                    onChange={(e) => applyEdit({ type: e.target.value })}
                    style={{ fontSize: 11, padding: '2px 4px', background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none' }}
                  >
                    {(TYPE_OPTIONS.includes(selected.type) ? TYPE_OPTIONS : [selected.type, ...TYPE_OPTIONS]).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{S.lengthLabel(seqLen)}</span>
                </div>
              </div>
              {confirming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{confirming === 'reset' ? S.resetConfirm : S.deleteConfirm}</span>
                  <button type="button" data-testid="common-feature-confirm-yes" onClick={doConfirm} style={dangerBtn}>OK</button>
                  <button type="button" data-testid="common-feature-confirm-no" onClick={() => setConfirming(null)} style={ghostBtn}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {selected.origin === 'overridden' && (
                    <button type="button" data-testid="common-feature-reset" onClick={() => setConfirming('reset')} style={ghostBtn}>{S.reset}</button>
                  )}
                  {selected.origin === 'user' && (
                    <button type="button" data-testid="common-feature-delete" onClick={() => setConfirming('delete')} style={ghostBtn}>{S.deleteUser}</button>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {seqLen > 0 && (
                <div style={{ padding: '8px 16px 0' }}>
                  <LinearFeatureBar
                    annotations={detailFragment.annotations}
                    seqLength={seqLen}
                    onSelect={(p) => sel.onCaretChange(p)}
                    onScrub={() => {}}
                    cursorPosition={sel.caretPos}
                  />
                </div>
              )}
              <div data-testid="common-features-detail-viewer" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
                {seqLen > 0
                  ? (
                    <SequenceView
                      fragments={[detailFragment]}
                      circular={false}
                      editable
                      onSequenceEdit={handleSequenceEdit}
                      caretPos={sel.caretPos}
                      caretAnchor={sel.caretAnchor}
                      selectionMode={sel.selectionMode}
                      selectionStrand={sel.selectionStrand}
                      onCaretChange={sel.onCaretChange}
                      onSelectRange={sel.onSelectRange}
                    />
                  )
                  : <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ghostBtn = {
  fontSize: 11, padding: '4px 8px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const dangerBtn = {
  fontSize: 11, padding: '4px 10px', background: 'var(--danger-500, #dc2626)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
};
