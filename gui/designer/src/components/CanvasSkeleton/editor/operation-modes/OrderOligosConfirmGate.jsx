/**
 * OrderOligosConfirmGate — explicit confirmation modal before ordering
 * oligos (F3 DEC-CANVAS-PCR-08 / NOTES §9.9.1 #11). Per-pair checkbox
 * + master "confirm all"; submit disabled until every pair is checked.
 * `data-modal-open` so useTabHotkey & friends back off while open.
 */
import { useState } from 'react';

function gc(seq) {
  const s = (seq || '').toUpperCase();
  if (!s.length) return 0;
  return Math.round(((s.match(/[GC]/g) || []).length / s.length) * 100);
}

export default function OrderOligosConfirmGate({ pairs = [], onConfirm, onCancel }) {
  const [checked, setChecked] = useState(() => pairs.map(() => false));
  const allChecked = checked.length > 0 && checked.every(Boolean);

  const toggle = (i) => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  const confirmAll = () => setChecked(pairs.map(() => true));

  return (
    <div
      data-testid="order-oligos-gate"
      data-modal-open=""
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(28,25,23,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxHeight: '78vh', overflowY: 'auto', background: 'var(--surface-1)', border: '1px solid var(--border-default, #d6d3d1)', borderRadius: 8, boxShadow: '0 8px 24px rgba(28,25,23,0.2)', display: 'flex', flexDirection: 'column' }}
      >
        <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Подтверждение заказа олигов
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="order-oligos-confirm-all"
              checked={allChecked}
              onChange={confirmAll}
            />
            Подтвердить все ({pairs.length})
          </label>
        </div>

        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pairs.map((p, i) => (
            <label
              key={i}
              data-testid="order-oligos-pair"
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                data-testid="order-oligos-check"
                checked={!!checked[i]}
                onChange={() => toggle(i)}
              />
              <span style={{ fontFamily: 'var(--mono, monospace)', minWidth: 0 }}>
                <div>F {(p.forward || '').slice(0, 24)} · {p.forward?.length}nt · GC {gc(p.forward)}%</div>
                <div>R {(p.reverse || '').slice(0, 24)} · {p.reverse?.length}nt · GC {gc(p.reverse)}%</div>
                <div style={{ color: 'var(--text-tertiary)' }}>источник: {p.source || 'auto'}</div>
              </span>
            </label>
          ))}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <button
            type="button"
            data-testid="order-oligos-cancel"
            onClick={onCancel}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >Отмена</button>
          <button
            type="button"
            data-testid="order-oligos-submit"
            disabled={!allChecked}
            onClick={() => onConfirm?.()}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 4, fontWeight: 600,
              border: '1px solid var(--accent-500, #b85c3e)',
              background: allChecked ? 'var(--accent-500, #b85c3e)' : 'transparent',
              color: allChecked ? '#fff' : 'var(--text-tertiary)',
              cursor: allChecked ? 'pointer' : 'not-allowed',
            }}
          >Заказать</button>
        </footer>
      </div>
    </div>
  );
}
