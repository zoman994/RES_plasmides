/**
 * AssemblySourcePicker — 2-step modal (A2 DEC-CANVAS-ASM-UX-05). Step 1
 * pick a container (search). Step 2 pick a range on a read-only mini
 * SequenceTab preview + optional RC, then Insert. The fast path stays
 * drag-from-sidebar (K4); this is the search / precise-range path.
 *
 * Closes on Esc / click-outside (ui-interactions: modal contract).
 */
import { useEffect, useMemo, useState } from 'react';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';

export default function AssemblySourcePicker({ containers, onInsert, onCancel }) {
  const [step, setStep] = useState(1);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [rc, setRc] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const list = useMemo(() => {
    const real = (containers || []).filter(
      (c) => c && c.id && typeof c.sequence === 'string' && c.sequence.length > 0,
    );
    const q = filter.trim().toLowerCase();
    return q ? real.filter((c) => (c.name || '').toLowerCase().includes(q)) : real;
  }, [containers, filter]);

  const choose = (c) => {
    setPicked(c);
    setStart(0);
    setEnd((c.sequence || '').length);
    setRc(false);
    setStep(2);
  };

  return (
    <div
      role="dialog"
      data-testid="assembly-source-picker"
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
          width: 560, maxHeight: '80%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            {step === 1 ? 'Откуда взять сегмент?' : `Диапазон · ${picked?.name || ''}`}
          </strong>
          <button type="button" data-testid="source-picker-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        {step === 1 && (
          <div style={{ padding: 12, overflowY: 'auto' }}>
            <input
              data-testid="source-picker-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск по имени…"
              style={textInput}
            />
            <div style={{ marginTop: 8 }}>
              {list.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 8 }}>
                  Нет контейнеров. Добавьте через Library.
                </div>
              )}
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid="source-picker-container"
                  data-container-id={c.id}
                  onClick={() => choose(c)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                    padding: '7px 10px', marginBottom: 4, textAlign: 'left',
                    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                    borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  }}
                >
                  <span aria-hidden>{c.topology?.circular ? '⭕' : '—'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{(c.sequence || '').length} bp</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && picked && (
          <div data-testid="source-picker-step2" style={{ padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 4, marginBottom: 10 }}>
              <SequenceTab
                sequence={picked.sequence || ''}
                annotations={picked.annotations || []}
                topology={picked.topology?.circular ? 'circular' : 'linear'}
                name={picked.name}
                editable={false}
                isReadOnlyZone={false}
                onSelectRange={(s, e) => {
                  if (Number.isFinite(s) && Number.isFinite(e) && e > s) { setStart(s); setEnd(e); }
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={lbl}>
                start
                <input
                  data-testid="source-picker-start"
                  type="number"
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                  style={numInput}
                />
              </label>
              <label style={lbl}>
                end
                <input
                  data-testid="source-picker-end"
                  type="number"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  style={numInput}
                />
              </label>
              <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <input
                  data-testid="source-picker-rc"
                  type="checkbox"
                  checked={rc}
                  onChange={() => setRc((v) => !v)}
                />
                RC
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          {step === 2 && (
            <button type="button" data-testid="source-picker-back" onClick={() => setStep(1)} style={ghostBtn}>
              ← Назад
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step === 2 && (
            <button
              type="button"
              data-testid="source-picker-insert"
              onClick={() => onInsert({
                containerId: picked.id, start: Number(start), end: Number(end), rc,
              })}
              style={primaryBtn}
            >
              Вставить
            </button>
          )}
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
const textInput = {
  width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
};
const numInput = {
  fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: 70, marginTop: 2,
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--text-secondary)' };
