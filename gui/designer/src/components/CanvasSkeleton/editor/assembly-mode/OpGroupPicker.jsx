/**
 * OpGroupPicker — M-CANVAS-WORKFLOW-UX K7 (SPEC §3 Шаг 2). After the
 * biolog selects ≥2 continuous pieces and clicks «🔗 Сшить» the picker
 * lets them pick the reaction method (overlap-PCR / Gibson / GG /
 * restriction / direct-ligation) and a name. The default is always
 * Overlap PCR (the safe internal-fuse default); ring closure + the
 * construct-level method are chosen in CircularizeModal, not here.
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useMemo, useState } from 'react';

// KLD is intentionally absent — it is a single-template self-closure reaction,
// not a way to join ≥2 selected pieces (the picker only opens on ≥2). KLD is
// offered only in CircularizeModal, gated to a single fragment (audit kld AM-1/AM-3).
const KINDS = [
  { id: 'overlap_pcr', label: 'Overlap PCR', note: 'даст линейный intermediate' },
  // A8 (audit) — the «даст кольцо — финал» note was false: Gibson is seamless
  // homology assembly; whether the product is a ring is set in CircularizeModal,
  // not by the reaction choice here.
  { id: 'gibson', label: 'Gibson', note: 'бесшовно по гомологии концов' },
  { id: 'golden_gate', label: 'Golden Gate', note: 'требует фермент Type IIS + нет внутренних сайтов' },
  { id: 'restriction', label: 'RE-клонирование', note: 'совместимые концы (фермент)' },
  { id: 'direct_ligation', label: 'Direct ligation', note: 'бленд / sticky' },
];

// A28 (audit) — the default is unconditionally Overlap PCR (the internal-fuse
// default; the finalizer / CircularizeModal own topology + the construct method).
// Was dressed up as «computed from topology/pieceCount» but both branches returned
// the same value and pieceCount was unread.
function autoSuggest() {
  return 'overlap_pcr';
}

export default function OpGroupPicker({
  pieceIds, zoneFinalTopology, onConfirm, onCancel,
}) {
  const initial = useMemo(() => autoSuggest(), []);
  const [kind, setKind] = useState(initial);
  const [name, setName] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      data-testid="op-group-picker-modal"
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500, background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Соединить {(pieceIds || []).length} куск(а/ов) в одну реакцию
          </strong>
          <button type="button" data-testid="op-group-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 6 }}>
            Метод соединения
          </div>
          {KINDS.map((k) => (
            <label key={k.id} style={radioRow}>
              <input
                type="radio"
                name="op-group-kind"
                data-testid={`op-group-kind-${k.id}`}
                checked={kind === k.id}
                onChange={() => setKind(k.id)}
              />
              <strong style={{ width: 140 }}>{k.label}</strong>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>({k.note})</span>
            </label>
          ))}

          <div style={{
            marginTop: 10, padding: '6px 10px', background: 'var(--accent-wash, rgba(184,92,62,0.10))',
            border: '1px solid var(--accent-500, #b85c3e)', borderRadius: 4, fontSize: 11,
          }}>
            <strong>Рекомендуется:</strong>{' '}
            {(KINDS.find((k) => k.id === initial) || {}).label}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
            Имя группы (опционально)
            <input
              data-testid="op-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="layer1-frag123-His"
              style={textInput}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="op-group-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="op-group-confirm"
            onClick={() => onConfirm({ kind, name: name.trim() })}
            style={primaryBtn}
          >Создать группу →</button>
        </div>
      </div>
    </div>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
};
const ghostBtn = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const textInput = {
  marginTop: 4, fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
  boxSizing: 'border-box',
};
const radioRow = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer',
};
