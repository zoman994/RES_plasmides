/**
 * RangePickerModal — M-CANVAS-WORKFLOW-UX K5 (SPEC §3.1.A step 2).
 *
 * After a plasmid is picked (inline EmptyAssemblyLibrary OR drag from
 * sidebar) the biolog confirms the slice on a near-fullscreen
 * SequenceTab. Игорь 20.05.2026: «все сиквенс виверы должны быть
 * идентичными по функционалу» — this modal embeds the SAME SequenceTab
 * the Library inspector and Container editor use, with the SAME
 * controlled selection state (caretPos / caretAnchor / strand / mode)
 * and the SAME restriction-site visibility (showReSites store flag).
 *
 * Cursor selection: SequenceView treats caretPos / caretAnchor as
 * fully controlled — without them the SelectionOverlay can't render
 * the highlight rect. Click on annotation / drag-select / Shift-click
 * all route through onCaretChange + onSelectRange below.
 *
 * RE sites: show whenever the global `showReSites` flag is on (default
 * for skeleton-editor mode). Clicking a site here SNAPS start/end onto
 * the recognition coordinates instead of opening the full cut popover
 * (the user wants to USE that range as a fragment, not to actually cut
 * the source plasmid).
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useState } from 'react';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';
import { useStore } from '../../../../store';
import { RE_ENZYMES } from '../../../../restriction-db';

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

  // SequenceView is fully controlled — without caretPos / caretAnchor
  // SelectionOverlay can't render the highlight rect (see
  // hooks/useSelectionState.js). Same shape as AssemblyShellBody +
  // PcrModeShell — single source of truth across sequence viewers.
  const [caretPos, setCaretPos] = useState(0);
  const [caretAnchor, setCaretAnchor] = useState(0);
  const [selectionMode, setSelectionMode] = useState('dna');
  const [selectionStrand, setSelectionStrand] = useState(1);
  const [reHighlightKey, setReHighlightKey] = useState(null);

  // Ensure RE sites are visible inside the modal (the Container editor
  // does the same on mount). Don't restore on unmount — biolog toggle
  // через panel должен переживать close.
  useEffect(() => {
    const st = useStore.getState();
    if (st.showReSites === undefined || st.showReSites === false) {
      useStore.setState({ showReSites: true });
    }
  }, []);

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
    const s = Number(a.start) || 0;
    const en = Number(a.end) || 0;
    setStart(s); setEnd(en);
    setCaretAnchor(s); setCaretPos(en);
  };

  // Mirror AssemblyShellBody — every selection updates BOTH the
  // start/end inputs (for confirm) and the SequenceView caret state
  // (for the visual highlight).
  const onSelectRange = (s, e, mode, strand) => {
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    if (e <= s) return;
    setStart(s); setEnd(e);
    setCaretAnchor(s); setCaretPos(e);
    setSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setSelectionStrand(strand === -1 ? -1 : 1);
  };

  const onCaretChange = (pos, opts) => {
    if (!Number.isFinite(pos)) return;
    setCaretPos(pos);
    if (!opts || !opts.extendSelection) {
      setCaretAnchor(pos);
      setSelectionMode('dna');
    } else {
      // extending — sync start/end to the new caret span.
      const s = Math.min(caretAnchor, pos);
      const en = Math.max(caretAnchor, pos);
      setStart(s); setEnd(en);
    }
  };

  // Click on an RE site → SNAP the selection onto the recognition
  // coordinates. Не открываем cut popover (резать источник внутри
  // RangePicker'а биологически бессмысленно — он не редактируется).
  const onRestrictionClick = (site /* , e */) => {
    if (!site || typeof site.position !== 'number') return;
    const enz = RE_ENZYMES[site.enzyme];
    const recogLen = enz && enz.site ? enz.site.length : 6;
    const s = site.position;
    const en = site.position + recogLen;
    setStart(s); setEnd(en);
    setCaretAnchor(s); setCaretPos(en);
    setReHighlightKey(`${site.enzyme}-${site.position}`);
  };

  const confirm = () => {
    onConfirm({ start: Number(start), end: Number(end), rc: !!rc });
  };

  const hasSelection = end > start;

  return (
    <div
      role="dialog"
      data-testid="range-picker-modal"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="range-picker-panel"
        style={{
          width: '95vw', height: '92vh', maxWidth: '95vw', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 16px 48px rgba(28,25,23,0.32)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 13, flex: 1 }}>
            Выбор фрагмента{source && source.name ? ` · ${source.name}` : ''}
          </strong>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginRight: 8 }}>
            Курсор / RE-сайт / фича → «Использовать как фрагмент»
          </span>
          <button type="button" data-testid="range-picker-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div data-testid="range-picker-viewer" style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4, margin: 10,
        }}>
          <SequenceTab
            sequence={seq}
            annotations={annotations}
            topology={source && source.circular ? 'circular' : 'linear'}
            name={(source && source.name) || ''}
            editable={false}
            isReadOnlyZone={false}
            caretPos={caretPos}
            caretAnchor={caretAnchor}
            selectionMode={selectionMode}
            selectionStrand={selectionStrand}
            onCaretChange={onCaretChange}
            onSelectRange={onSelectRange}
            onRestrictionClick={onRestrictionClick}
            restrictionHighlightKey={reHighlightKey}
            showSelectionTm
            /* V87 — dim everything outside [start, end] so the picked
               fragment reads as the foreground (matches wrap-block
               dimming style applied at character granularity). */
            outOfRangeMask={hasSelection ? { start, end } : null}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <label style={lbl}>
            start
            <input
              data-testid="range-picker-start"
              type="number"
              value={start}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStart(v);
                setCaretAnchor(v);
              }}
              style={numInput}
            />
          </label>
          <label style={lbl}>
            end
            <input
              data-testid="range-picker-end"
              type="number"
              value={end}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEnd(v);
                setCaretPos(v);
              }}
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
              style={{ ...numInput, width: 220 }}
            >
              <option value="">— выбрать —</option>
              {annotations.map((a, i) => (
                <option key={i} value={String(i)}>{featureLabel(a, i)}</option>
              ))}
            </select>
          </label>
          <span style={{ flex: 1, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            {hasSelection ? `${end - start} bp выбрано` : 'ничего не выделено'}
          </span>
          <button type="button" data-testid="range-picker-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="range-picker-confirm" onClick={confirm} style={primaryBtn}>
            Использовать как фрагмент →
          </button>
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
