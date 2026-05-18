/**
 * InsertGapModal — gap / spacer segment insertion (A2
 * DEC-CANVAS-ASM-UX-09). Three tabs: known linker presets / custom
 * sequence / unknown-length placeholder. Backed by
 * insertManualSegment (A1 manual-as-gap variant).
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useState } from 'react';

// Common cloning linkers (DNA). Lengths are codon-multiples; these are
// spacer/fusion linkers, not enzymes — no GG/RE dictionary involved.
const LINKERS = [
  { name: '6×His', seq: 'CACCACCACCACCACCAC' },
  { name: 'GS×3 (Gly-Ser)', seq: 'GGTGGAGGCGGTTCTGGTGGAGGCGGTTCTGGTGGAGGCGGTTCT' },
  { name: 'T2A', seq: 'GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT' },
  { name: 'P2A', seq: 'GGAAGCGGAGCTACTAACTTCAGCCTGCTGAAGCAGGCTGGAGACGTGGAGGAGAACCCTGGACCT' },
];

export default function InsertGapModal({ onInsert, onCancel }) {
  const [tab, setTab] = useState('linker');
  const [presetIdx, setPresetIdx] = useState(0);
  const [custom, setCustom] = useState('');
  const [unknownLen, setUnknownLen] = useState(30);
  const [label, setLabel] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = () => {
    const lbl = label.trim() || undefined;
    if (tab === 'linker') {
      const lk = LINKERS[presetIdx] || LINKERS[0];
      onInsert({ sequence: lk.seq, label: lbl || lk.name, gapLabel: lk.name });
      return;
    }
    if (tab === 'custom') {
      const seq = custom.replace(/[^a-zA-Z]/g, '').toUpperCase();
      onInsert({ sequence: seq, label: lbl });
      return;
    }
    const len = Math.max(1, Math.trunc(Number(unknownLen) || 0));
    onInsert({ length: len, gapKind: 'unknown', label: lbl, gapLabel: lbl });
  };

  const tabBtn = (id, text) => (
    <button
      type="button"
      data-testid={`gap-tab-${id}`}
      onClick={() => setTab(id)}
      style={{
        fontSize: 11.5, padding: '5px 12px', border: 'none', cursor: 'pointer',
        background: tab === id ? 'var(--accent-500, #b85c3e)' : 'var(--surface-1)',
        color: tab === id ? '#fff' : 'var(--text-secondary)',
        fontWeight: tab === id ? 600 : 400,
      }}
    >{text}</button>
  );

  return (
    <div
      role="dialog"
      data-testid="insert-gap-modal"
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
          width: 460, background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>Вставить gap / spacer</strong>
          <button type="button" data-testid="gap-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
          {tabBtn('linker', 'Линкер')}
          {tabBtn('custom', 'Своя ПСО')}
          {tabBtn('unknown', 'Неизв. длина')}
        </div>

        <div style={{ padding: 12 }}>
          {tab === 'linker' && (
            <div>
              {LINKERS.map((lk, i) => (
                <button
                  key={lk.name}
                  type="button"
                  data-testid="gap-preset"
                  data-preset={lk.name}
                  onClick={() => setPresetIdx(i)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                    padding: '6px 10px', marginBottom: 4, textAlign: 'left', fontSize: 11.5,
                    border: '1px solid ' + (presetIdx === i ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'),
                    background: presetIdx === i ? 'var(--surface-3, rgba(184,92,62,0.10))' : 'var(--surface-2)',
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  <strong style={{ width: 110 }}>{lk.name}</strong>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lk.seq}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tab === 'custom' && (
            <textarea
              data-testid="gap-custom-seq"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="ATCG…"
              rows={4}
              style={{
                width: '100%', fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
                padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 4,
                background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
              }}
            />
          )}
          {tab === 'unknown' && (
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)' }}>
              Длина (bp) — отрисуется как N×длина
              <input
                data-testid="gap-unknown-len"
                type="number"
                min={1}
                value={unknownLen}
                onChange={(e) => setUnknownLen(e.target.value)}
                style={numInput}
              />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
            Метка (необязательно)
            <input
              data-testid="gap-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ ...numInput, width: '100%' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="gap-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="gap-insert" onClick={submit} style={primaryBtn}>Вставить</button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const numInput = {
  fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: 90, marginTop: 4,
};
