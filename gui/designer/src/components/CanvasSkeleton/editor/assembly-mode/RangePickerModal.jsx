/**
 * RangePickerModal — M-CANVAS-WORKFLOW-UX K5 (SPEC §3.1.A step 2).
 *
 * After a plasmid is picked (PlaceholderTreePicker OR drag from
 * sidebar) the biolog confirms the slice on a mini read-only
 * SequenceTab: numeric start/end, RC, features dropdown (snap range to
 * an annotation), then Add → onConfirm({start,end,rc}).
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useState } from 'react';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';

function featureLabel(a, idx) {
  const base = a && (a.label || a.name || a.type) ? (a.label || a.name || a.type) : `feature ${idx + 1}`;
  const s = Number.isFinite(a && a.start) ? a.start : 0;
  const e = Number.isFinite(a && a.end) ? a.end : 0;
  return `${base} (${s}-${e})`;
}

export default function RangePickerModal({ source, onConfirm, onCancel }) {
  const seq = (source && source.sequence) || '';
  const annotations = (source && source.annotations) || [];
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(seq.length);
  const [rc, setRc] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const onPickFeature = (e) => {
    const v = e.target.value;
    if (v === '') return;
    const a = annotations[Number(v)];
    if (!a) return;
    setStart(Number(a.start) || 0);
    setEnd(Number(a.end) || 0);
  };

  const onSelectRange = (s, e) => {
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) { setStart(s); setEnd(e); }
  };

  const confirm = () => {
    onConfirm({ start: Number(start), end: Number(end), rc: !!rc });
  };

  return (
    <div
      role="dialog"
      data-testid="range-picker-modal"
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
          width: 600, maxHeight: '82%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Диапазон{source && source.name ? ` · ${source.name}` : ''}
          </strong>
          <button type="button" data-testid="range-picker-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div data-testid="range-picker-viewer" style={{
          maxHeight: 240, overflow: 'auto', border: '1px solid var(--border-subtle)',
          borderRadius: 4, margin: 10, flexShrink: 0,
        }}>
          <SequenceTab
            sequence={seq}
            annotations={annotations}
            topology={source && source.circular ? 'circular' : 'linear'}
            name={(source && source.name) || ''}
            editable={false}
            isReadOnlyZone={false}
            onSelectRange={onSelectRange}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 10px', flexWrap: 'wrap' }}>
          <label style={lbl}>
            start
            <input
              data-testid="range-picker-start"
              type="number"
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              style={numInput}
            />
          </label>
          <label style={lbl}>
            end
            <input
              data-testid="range-picker-end"
              type="number"
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              style={numInput}
            />
          </label>
          <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <input
              data-testid="range-picker-rc"
              type="checkbox"
              checked={rc}
              onChange={() => setRc((v) => !v)}
            />
            RC
          </label>
          <label style={lbl}>
            Из аннотации
            <select
              data-testid="range-picker-feature"
              defaultValue=""
              onChange={onPickFeature}
              style={{ ...numInput, width: 180 }}
            >
              <option value="">— выбрать —</option>
              {annotations.map((a, i) => (
                <option key={i} value={String(i)}>{featureLabel(a, i)}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="range-picker-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="range-picker-confirm" onClick={confirm} style={primaryBtn}>Вставить →</button>
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
const numInput = {
  fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: 80, marginTop: 2,
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--text-secondary)' };
