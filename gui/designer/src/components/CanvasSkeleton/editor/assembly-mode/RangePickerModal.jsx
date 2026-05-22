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
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';

function featureLabel(a, idx) {
  const base = a && (a.label || a.name || a.type) ? (a.label || a.name || a.type) : `feature ${idx + 1}`;
  const s = Number.isFinite(a && a.start) ? a.start : 0;
  const e = Number.isFinite(a && a.end) ? a.end : 0;
  return `${base} (${s}-${e})`;
}

export default function RangePickerModal({ source, onConfirm, onCancel }) {
  const seq = (source && source.sequence) || '';
  const annotations = (source && source.annotations) || [];
  const [rc, setRc] = useState(false);
  const [reHighlightKey, setReHighlightKey] = useState(null);
  // V89-extra — feature/numeric override the hook's cursor/restriction
  // acquisitionMethod label (cosmetic in the hint; downstream branches
  // only on 'restriction'). null → use hook's value.
  const [methodOverride, setMethodOverride] = useState(null);

  // SPEC_VIEWER_UNIFICATION — controlled selection + V88 RE pair-select
  // + drag-grace all come from the shared hook now. start/end derive
  // from the hook's selStart/selEnd.
  const sel = useSequenceSelection({
    initialCaret: 0,
    reBehavior: 'pair-select',
    reEnzymes: RE_ENZYMES,
    onPairCommit: ({
      firstEnzyme, firstPosition, secondEnzyme, secondPosition,
    }) => {
      setReHighlightKey(`${firstEnzyme}-${firstPosition}|${secondEnzyme}-${secondPosition}`);
      setMethodOverride(null); // hook sets acquisitionMethod='restriction'
    },
    onAfterSelect: () => { setReHighlightKey(null); setMethodOverride(null); },
    onAfterCaret: () => { setReHighlightKey(null); setMethodOverride(null); },
  });
  const { firstRESite } = sel;
  // Picker semantics: anchor = start, pos = end (every selection path
  // sets anchor ≤ pos; numeric inputs may set anchor > pos transiently,
  // so read RAW, not min/max — preserves the biolog's typed intent).
  const start = Number.isFinite(sel.caretAnchor) ? sel.caretAnchor : 0;
  const end = Number.isFinite(sel.caretPos) ? sel.caretPos : seq.length;
  const acquisitionMethod = methodOverride || sel.acquisitionMethod;

  // Default selection = whole source [0, seq.length] so a confirm with
  // no manual selection inserts the full-length fragment (hook inits
  // caret to 0; we extend pos to the end on mount / source change).
  useEffect(() => {
    sel.setCaretAnchor(0);
    sel.setCaretPos(seq.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq.length]);

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
    sel.setCaretAnchor(s);
    sel.setCaretPos(en);
    sel.setSelectionMode('dna');
    setReHighlightKey(null);
    setMethodOverride('feature');
  };

  // First-click RE snap highlights the single site; the pair commit
  // (onPairCommit) sets the dual key. firstRESite drives the single.
  const reHighlight = firstRESite
    ? `${firstRESite.enzyme}-${firstRESite.position}`
    : reHighlightKey;

  // V88 — test escape hatch. SequenceView's RE-click goes through deep
  // SVG markers that are hard to simulate in unit tests; this window
  // event drives the hook's onRestrictionClick directly.
  useEffect(() => {
    const onEv = (e) => {
      if (e && e.detail) sel.onRestrictionClick(e.detail);
    };
    window.addEventListener('__v88_re_click__', onEv);
    return () => window.removeEventListener('__v88_re_click__', onEv);
  });

  const confirm = () => {
    onConfirm({
      start: Number(start),
      end: Number(end),
      rc: !!rc,
      acquisitionMethod,
    });
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
            caretPos={sel.caretPos}
            caretAnchor={sel.caretAnchor}
            selectionMode={sel.selectionMode}
            selectionStrand={sel.selectionStrand}
            onCaretChange={sel.onCaretChange}
            onSelectRange={sel.onSelectRange}
            onRestrictionClick={sel.onRestrictionClick}
            restrictionHighlightKey={reHighlight}
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
                sel.setCaretAnchor(v);
                setReHighlightKey(null);
                setMethodOverride('numeric');
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
                sel.setCaretPos(v);
                setReHighlightKey(null);
                setMethodOverride('numeric');
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
            {firstRESite
              ? `RE-сайт «${firstRESite.enzyme}» зафиксирован — кликни второй RE, чтобы взять фрагмент между ними`
              : hasSelection
                ? `${end - start} bp выбрано · метод: ${acquisitionMethod}`
                : 'ничего не выделено'}
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
