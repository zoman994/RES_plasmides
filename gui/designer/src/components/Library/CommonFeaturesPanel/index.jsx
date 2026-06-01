/**
 * CommonFeaturesPanel — Library section for browsing + editing the
 * common-features DB (SPEC_COMMON_FEATURES DEC-CF-06; master-detail per the
 * acceptance fix DEC-CF-10). Master = the merged list (factory + user overlay)
 * with provenance badge + search; clicking a row selects it. Detail =
 * LinearFeatureBar (колбаса) + read-only SequenceView over a SYNTHESIZED
 * single-region fragment of the selected feature (same shape as
 * inspector/tabs/SequenceTab's `fragment`), so the biolog can verify the
 * record: DNA track + annotation track + AA track (AATrack translates inside
 * the CDS box for CDS/marker/reporter — V133/V138) + колбаса. Edit / reset /
 * delete live in the detail header; lean inline editor (§9-B).
 *
 * NOT LibrarySingleInspector wholesale (tabs/history/save-flow/primers/project
 * scope don't apply to a reference record) — SequenceView + LinearFeatureBar
 * directly. NOT a drag source (DEC-CF-07): common features never reach the
 * palette — this panel only reads/edits the overlay store.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore, selectMergedCommonFeatures } from '../../../store';
import { loadFeatureDB } from '../../../feature-detection';
import { STRINGS } from '../../../lib/strings';
import { buildPromoteCandidate } from '../../SequenceView/hooks/usePromoteToCommon';
import SequenceView from '../../SequenceView';
import LinearFeatureBar from '../inspector/tabs/LinearFeatureBar';

const S = STRINGS.commonFeatures;

const TYPE_OPTIONS = [
  'CDS', 'marker', 'reporter', 'promoter', 'terminator', 'rep_origin',
  'primer_bind', 'protein_bind', 'RBS', 'polyA_signal', 'enhancer',
  'LTR', 'sig_peptide', 'misc_feature',
];

const BADGE = {
  factory: { label: S.badgeFactory, bg: 'var(--surface-2)', fg: 'var(--text-secondary)' },
  user: { label: S.badgeUser, bg: 'var(--accent-wash, rgba(184,92,62,0.12))', fg: 'var(--accent-700, #8a3a22)' },
  overridden: { label: S.badgeOverridden, bg: 'var(--warning-bg, #fffbeb)', fg: 'var(--warning-text, #92400e)' },
};

const noop = () => {};

function keyOf(f) {
  return f.origin === 'user' ? f.id : f.baseId;
}

export default function CommonFeaturesPanel() {
  const overlay = useStore((s) => s.commonFeatures);
  const overrideCommonFeature = useStore((s) => s.overrideCommonFeature);
  const resetCommonFeature = useStore((s) => s.resetCommonFeature);
  const deleteUserFeature = useStore((s) => s.deleteUserFeature);
  const updateUserFeature = useStore((s) => s.updateUserFeature);

  const [builtin, setBuiltin] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(null); // 'reset' | 'delete'

  useEffect(() => {
    let cancelled = false;
    loadFeatureDB()
      .then((db) => { if (!cancelled) setBuiltin(db?.features || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  // Detail target — looked up from the FULL merged list so a search that
  // hides the row doesn't blank the detail; clears to hint when the
  // selected feature is gone (deleted user / reset-then-reselected).
  const selected = useMemo(
    () => merged.find((f) => keyOf(f) === selectedKey) || null,
    [merged, selectedKey],
  );

  // Synthesized single-region fragment (DEC-CF-10) — same shape as
  // SequenceTab.fragment so SequenceView renders DNA + annotation + AA tracks.
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

  const selectFeature = (f) => {
    setEditing(false);
    setConfirming(null);
    setDraft(null);
    setSelectedKey(keyOf(f));
  };

  const startEdit = () => {
    if (!selected) return;
    setConfirming(null);
    setDraft({ name: selected.name || '', type: selected.type || 'misc_feature', sequence: selected.sequence || '' });
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setDraft(null); };
  const saveEdit = async () => {
    if (!selected || !draft) return;
    const cand = buildPromoteCandidate(draft);
    const patch = { name: cand.name, type: cand.type, sequence: cand.sequence, length: cand.sequence.length };
    if (cand.protein) patch.protein = cand.protein;
    if (selected.origin === 'user') await updateUserFeature(selected.id, patch);
    else await overrideCommonFeature(selected.baseId, patch);
    cancelEdit();
  };

  const doConfirm = async () => {
    if (!selected || !confirming) return;
    if (confirming === 'reset') await resetCommonFeature(selected.baseId);
    else if (confirming === 'delete') { await deleteUserFeature(selected.id); setSelectedKey(null); }
    setConfirming(null);
  };

  const seqLen = detailFragment ? detailFragment.sequence.length : 0;

  return (
    <div
      data-testid="common-features-panel"
      style={{ display: 'flex', minHeight: 0, height: '100%', background: 'var(--surface-1)' }}
    >
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
            style={{
              height: 28, padding: '0 10px', fontSize: 12,
              background: 'var(--surface-2)', color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none',
            }}
          />
        </div>
        <div data-testid="common-features-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div data-testid="common-features-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {S.empty}
            </div>
          ) : filtered.map((f) => {
            const k = keyOf(f);
            const badge = BADGE[f.origin] || BADGE.factory;
            const active = k === selectedKey;
            return (
              <button
                type="button"
                key={k}
                data-testid={`common-feature-row-${k}`}
                aria-pressed={active}
                onClick={() => selectFeature(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 16px', border: 'none', borderBottom: '0.5px solid var(--border-subtle)',
                  cursor: 'pointer',
                  background: active ? 'var(--accent-wash, rgba(184,92,62,0.10))' : 'transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</span>
                    <span
                      data-testid={`common-feature-badge-${k}`}
                      data-origin={f.origin}
                      style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: badge.bg, color: badge.fg, textTransform: 'uppercase', letterSpacing: 0.3 }}
                    >{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {f.type} · {S.lengthLabel(f.length || f.sequence?.length || 0)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail ──────────────────────────────────────────────── */}
      <div data-testid="common-features-detail" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!selected ? (
          <div data-testid="common-features-detail-hint" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: 32 }}>
            {S.selectHint}
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span data-testid="common-features-detail-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name || '(unnamed)'}</span>
                  <span data-testid="common-features-detail-badge" data-origin={selected.origin} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: (BADGE[selected.origin] || BADGE.factory).bg, color: (BADGE[selected.origin] || BADGE.factory).fg, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {(BADGE[selected.origin] || BADGE.factory).label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {selected.type} · {S.lengthLabel(selected.length || seqLen)}
                </div>
              </div>
              {confirming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {confirming === 'reset' ? S.resetConfirm : S.deleteConfirm}
                  </span>
                  <button type="button" data-testid="common-feature-confirm-yes" onClick={doConfirm} style={dangerBtn}>OK</button>
                  <button type="button" data-testid="common-feature-confirm-no" onClick={() => setConfirming(null)} style={ghostBtn}>✕</button>
                </div>
              ) : !editing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button type="button" data-testid="common-feature-edit" onClick={startEdit} style={ghostBtn}>{S.edit}</button>
                  {selected.origin === 'overridden' && (
                    <button type="button" data-testid="common-feature-reset" onClick={() => setConfirming('reset')} style={ghostBtn}>{S.reset}</button>
                  )}
                  {selected.origin === 'user' && (
                    <button type="button" data-testid="common-feature-delete" onClick={() => setConfirming('delete')} style={ghostBtn}>{S.deleteUser}</button>
                  )}
                </div>
              )}
            </div>

            {editing ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={lbl}>{S.fieldName}
                  <input data-testid="common-feature-edit-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={editInp} />
                </label>
                <label style={lbl}>{S.fieldType}
                  <select data-testid="common-feature-edit-type" value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} style={editInp}>
                    {(TYPE_OPTIONS.includes(draft.type) ? TYPE_OPTIONS : [draft.type, ...TYPE_OPTIONS]).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={lbl}>{S.fieldSequence}
                  <textarea data-testid="common-feature-edit-seq" value={draft.sequence} onChange={(e) => setDraft((d) => ({ ...d, sequence: e.target.value }))} rows={3} style={{ ...editInp, fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }} />
                </label>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" data-testid="common-feature-edit-cancel" onClick={cancelEdit} style={ghostBtn}>{S.cancel}</button>
                  <button type="button" data-testid="common-feature-edit-save" onClick={saveEdit} style={primaryBtn}>{S.save}</button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {seqLen > 0 && (
                  <div style={{ padding: '8px 16px 0' }}>
                    <LinearFeatureBar
                      annotations={detailFragment.annotations}
                      seqLength={seqLen}
                      onSelect={noop}
                      onScrub={noop}
                    />
                  </div>
                )}
                <div data-testid="common-features-detail-viewer" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
                  {seqLen > 0
                    ? <SequenceView fragments={[detailFragment]} circular={false} readOnly />
                    : <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const lbl = { display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 };
const editInp = {
  fontSize: 12, padding: '5px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
};
const ghostBtn = {
  fontSize: 11, padding: '4px 8px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '4px 12px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const dangerBtn = {
  fontSize: 11, padding: '4px 10px', background: 'var(--danger-500, #dc2626)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
};
