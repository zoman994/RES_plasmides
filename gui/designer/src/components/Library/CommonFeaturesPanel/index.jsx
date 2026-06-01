/**
 * CommonFeaturesPanel — Library section for browsing + editing the
 * common-features DB (SPEC_COMMON_FEATURES DEC-CF-06). Renders the merged
 * list (factory built-in + user overlay) with a provenance badge, a lean
 * inline editor (name / type / ПСО), reset-to-factory on overridden rows,
 * and delete on user rows. Search by name or type.
 *
 * NOT a drag source (DEC-CF-07): common features never enter the palette —
 * this panel only reads/edits the overlay store, it doesn't expose entries.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore, selectMergedCommonFeatures } from '../../../store';
import { loadFeatureDB } from '../../../feature-detection';
import { STRINGS } from '../../../lib/strings';
import { buildPromoteCandidate } from '../../SequenceView/hooks/usePromoteToCommon';

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
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(null); // { key, action }

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

  const startEdit = (f) => {
    setConfirming(null);
    setEditingKey(keyOf(f));
    setDraft({ name: f.name || '', type: f.type || 'misc_feature', sequence: f.sequence || '' });
  };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); };
  const saveEdit = async (f) => {
    const cand = buildPromoteCandidate(draft);
    const patch = { name: cand.name, type: cand.type, sequence: cand.sequence, length: cand.sequence.length };
    if (cand.protein) patch.protein = cand.protein;
    if (f.origin === 'user') await updateUserFeature(f.id, patch);
    else await overrideCommonFeature(f.baseId, patch);
    cancelEdit();
  };

  const doConfirm = async (f) => {
    if (!confirming) return;
    if (confirming.action === 'reset') await resetCommonFeature(f.baseId);
    else if (confirming.action === 'delete') await deleteUserFeature(f.id);
    setConfirming(null);
  };

  return (
    <div
      data-testid="common-features-panel"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', background: 'var(--surface-1)' }}
    >
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
          <div data-testid="common-features-empty" style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {S.empty}
          </div>
        ) : filtered.map((f) => {
          const k = keyOf(f);
          const badge = BADGE[f.origin] || BADGE.factory;
          const editing = editingKey === k;
          if (editing) {
            return (
              <div key={k} data-testid={`common-feature-row-${k}`} style={rowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  <input
                    data-testid={`common-feature-edit-name-${k}`}
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    style={editInp}
                  />
                  <select
                    data-testid={`common-feature-edit-type-${k}`}
                    value={draft.type}
                    onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                    style={editInp}
                  >
                    {(TYPE_OPTIONS.includes(draft.type) ? TYPE_OPTIONS : [draft.type, ...TYPE_OPTIONS]).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <textarea
                    data-testid={`common-feature-edit-seq-${k}`}
                    value={draft.sequence}
                    onChange={(e) => setDraft((d) => ({ ...d, sequence: e.target.value }))}
                    rows={2}
                    style={{ ...editInp, fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" data-testid={`common-feature-edit-cancel-${k}`} onClick={cancelEdit} style={ghostBtn}>{S.cancel}</button>
                    <button type="button" data-testid={`common-feature-edit-save-${k}`} onClick={() => saveEdit(f)} style={primaryBtn}>{S.save}</button>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={k} data-testid={`common-feature-row-${k}`} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
              {confirming?.key === k ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {confirming.action === 'reset' ? S.resetConfirm : S.deleteConfirm}
                  </span>
                  <button type="button" data-testid={`common-feature-confirm-yes-${k}`} onClick={() => doConfirm(f)} style={dangerBtn}>OK</button>
                  <button type="button" data-testid={`common-feature-confirm-no-${k}`} onClick={() => setConfirming(null)} style={ghostBtn}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button type="button" data-testid={`common-feature-edit-${k}`} onClick={() => startEdit(f)} style={ghostBtn}>{S.edit}</button>
                  {f.origin === 'overridden' && (
                    <button type="button" data-testid={`common-feature-reset-${k}`} onClick={() => setConfirming({ key: k, action: 'reset' })} style={ghostBtn}>{S.reset}</button>
                  )}
                  {f.origin === 'user' && (
                    <button type="button" data-testid={`common-feature-delete-${k}`} onClick={() => setConfirming({ key: k, action: 'delete' })} style={ghostBtn}>{S.deleteUser}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 16px', borderBottom: '0.5px solid var(--border-subtle)',
};
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
