/**
 * MutationModal — M-CANVAS-WORKFLOW-UX K14 (SPEC §5.2). Add a per-base
 * mutation to a sourced piece. K11 primer-derive applies it to the
 * binding region; K15 finalizer flags PCR/KLD-incompatible methods.
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useState } from 'react';

const BASES = ['A', 'C', 'G', 'T'];
const KINDS = [
  { id: 'silent', label: 'Silent' },
  { id: 'missense', label: 'Missense' },
  { id: 'nonsense', label: 'Nonsense' },
];

export default function MutationModal({
  sourceName, defaultPosition, fromBase, onConfirm, onCancel,
}) {
  const [position, setPosition] = useState(
    Number.isFinite(defaultPosition) ? defaultPosition : 0,
  );
  const [toBase, setToBase] = useState(
    BASES.find((b) => b !== (fromBase || '').toUpperCase()) || 'T',
  );
  const [kind, setKind] = useState('silent');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const apply = () => {
    onConfirm({
      position: Number(position),
      fromBase: (fromBase || '').toUpperCase(),
      toBase: toBase.toUpperCase(),
      kind,
      notes: notes.trim(),
    });
  };

  return (
    <div
      role="dialog"
      data-testid="mutation-modal"
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
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Mutation на {sourceName || 'piece'} position {position}
          </strong>
          <button type="button" data-testid="mutation-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={lbl}>
              Position
              <input
                data-testid="mutation-position"
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                style={numInp}
              />
            </label>
            <div data-testid="mutation-frombase" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Original base: <strong style={{ color: 'var(--text-primary)' }}>{(fromBase || '?').toUpperCase()}</strong>
            </div>
            <label style={lbl}>
              New base
              <select
                data-testid="mutation-tobase"
                value={toBase}
                onChange={(e) => setToBase(e.target.value)}
                style={numInp}
              >
                {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          </div>

          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 4 }}>Kind</div>
            {KINDS.map((k) => (
              <label key={k.id} style={radioRow}>
                <input
                  type="radio"
                  name="mutation-kind"
                  data-testid={`mutation-kind-${k.id}`}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                />
                {k.label}
              </label>
            ))}
          </div>

          <label style={lbl}>
            Notes (опц)
            <input
              data-testid="mutation-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="K77E / test substitution"
              style={textInp}
            />
          </label>

          <div style={{
            padding: '6px 10px', fontSize: 10.5, color: 'var(--text-secondary)',
            background: 'var(--accent-wash, rgba(184,92,62,0.08))', borderRadius: 4,
          }}>
            Mutation реализуется через mutagenic primer (Overlap PCR / KLD).
            Если кусок попадёт в Gibson/GG-группу — она не сработает; K15 finalizer
            предупредит.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="mutation-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="mutation-apply" onClick={apply} style={primaryBtn}>Применить</button>
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
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--text-secondary)' };
const numInp = {
  marginTop: 4, fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', width: 90,
};
const textInp = {
  marginTop: 4, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
  boxSizing: 'border-box',
};
const radioRow = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, marginRight: 12,
};
