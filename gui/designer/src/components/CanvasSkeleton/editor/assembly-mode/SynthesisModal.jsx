/**
 * SynthesisModal — M-CANVAS-WORKFLOW-UX K4 (SPEC §3.1.C). «+ Синтез»:
 * paste an own-synthesis fragment (ПСО / gBlock). Live length + GC.
 * Mode: in-this-assembly only (kind='synthesis' piece) OR also save as
 * a reusable container (caller materialises → sourced piece).
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useMemo, useState } from 'react';

const CLEAN = (s) => String(s || '').replace(/\s/g, '');
const isValid = (s) => s.length > 0 && /^[ACGT]+$/i.test(s);
function gcPct(s) {
  if (!s.length) return 0;
  let gc = 0;
  for (const ch of s.toUpperCase()) if (ch === 'G' || ch === 'C') gc += 1;
  return Math.round((gc / s.length) * 100);
}

export default function SynthesisModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState('inline'); // 'inline' | 'container'

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const seq = useMemo(() => CLEAN(raw), [raw]);
  const valid = isValid(seq);

  const submit = () => {
    if (!valid) return;
    onConfirm({ sequence: seq.toUpperCase(), name: name.trim(), mode });
  };

  return (
    <div
      role="dialog"
      data-testid="synthesis-modal"
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
          <strong style={{ fontSize: 12.5, flex: 1 }}>Своя ПСО (синтез)</strong>
          <button type="button" data-testid="synthesis-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12 }}>
          <label style={lbl}>
            Имя
            <input
              data-testid="synthesis-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...textInput, marginTop: 4 }}
            />
          </label>
          <label style={{ ...lbl, marginTop: 10 }}>
            Последовательность
            <textarea
              data-testid="synthesis-seq"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="ATGAAA…"
              rows={5}
              style={{
                width: '100%', marginTop: 4, fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
                padding: 8, border: `1px solid ${raw && !valid ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
                borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </label>
          <div data-testid="synthesis-stats" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Длина: {seq.length} нт{' · '}GC: {gcPct(seq)}%{' · '}Topology: linear
            {raw && !valid && (
              <span style={{ color: 'var(--accent-500, #b85c3e)', marginLeft: 8 }}>
                только A/C/G/T
              </span>
            )}
          </div>

          <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, marginTop: 10, padding: '8px 10px' }}>
            <legend style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '0 4px' }}>Режим</legend>
            <label style={radioLbl}>
              <input
                type="radio"
                name="synth-mode"
                data-testid="synthesis-mode-inline"
                checked={mode === 'inline'}
                onChange={() => setMode('inline')}
              />
              Только в этой сборке (одноразовый кусок)
            </label>
            <label style={{ ...radioLbl, marginTop: 4 }}>
              <input
                type="radio"
                name="synth-mode"
                data-testid="synthesis-mode-container"
                checked={mode === 'container'}
                onChange={() => setMode('container')}
              />
              Сохранить как контейнер (переиспользование в др. проектах)
            </label>
          </fieldset>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="synthesis-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="synthesis-add"
            disabled={!valid}
            onClick={submit}
            style={{ ...primaryBtn, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }}
          >Добавить →</button>
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
  color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600,
};
const textInput = {
  width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)' };
const radioLbl = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-primary)', cursor: 'pointer' };
