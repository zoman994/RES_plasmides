/**
 * AddPiecePopover — shared «+ piece» entry-point popover for all 3
 * assembly views (Frame / Sequence / Editor).
 *
 * SPEC_ASSEMBLY_VIEWS_UNIFICATION §4.5 + §5.5. Single source of truth
 * for the 4 piece-kind entry-points so the labels / icons / hotkeys
 * stay identical across surfaces.
 *
 * Stateless. Caller decides where to anchor it (pass `anchorRect` or
 * inline position) and which action callback to attach to each kind.
 *
 * Esc / click-outside closes. Each item also responds to keyboard
 * shortcut (P / S / . / G) while the popover has focus.
 */
import { useEffect, useRef } from 'react';

export const ADD_PIECE_KINDS = [
  { id: 'plasmid',  icon: '🧬', label: 'Из плазмиды',  hint: 'pUC19 / pET-28b / любая из библиотеки', hotkey: 'P' },
  { id: 'snippet',  icon: '✦',  label: 'Обвес',        hint: '6×His / linker / restriction site',     hotkey: 'S' },
  { id: 'synthesis', icon: '🧪', label: 'Синтез',      hint: 'длинный кусок ПСО (≥100 bp)',           hotkey: '.' },
  { id: 'gap',      icon: '◊',  label: 'Заглушка',    hint: 'placeholder без последовательности',    hotkey: 'G' },
];

export default function AddPiecePopover({
  anchorPos,
  onPick,
  onClose,
  testId = 'add-piece-popover',
}) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      const k = (e.key || '').toLowerCase();
      const hit = ADD_PIECE_KINDS.find((p) => p.hotkey.toLowerCase() === k);
      if (hit) { e.preventDefault(); onPick?.(hit.id); }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose, onPick]);

  const style = anchorPos
    ? {
      position: 'absolute',
      top: anchorPos.y,
      left: anchorPos.x,
    }
    : {
      position: 'fixed',
      top: '40%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };

  return (
    <div
      ref={ref}
      role="menu"
      data-testid={testId}
      style={{
        ...style,
        zIndex: 90,
        minWidth: 240,
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(28,25,23,0.20)',
        padding: 6,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          padding: '4px 8px 6px',
        }}
      >
        Добавить кусок
      </div>
      {ADD_PIECE_KINDS.map((kind) => (
        <button
          key={kind.id}
          type="button"
          role="menuitem"
          data-testid={`${testId}-${kind.id}`}
          onClick={() => onPick?.(kind.id)}
          style={styles.item}
        >
          <span style={styles.itemIcon} aria-hidden>{kind.icon}</span>
          <span style={styles.itemBody}>
            <span style={styles.itemLabel}>{kind.label}</span>
            <span style={styles.itemHint}>{kind.hint}</span>
          </span>
          <span style={styles.itemHotkey}>{kind.hotkey}</span>
        </button>
      ))}
    </div>
  );
}

const styles = {
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '6px 8px', marginBottom: 2,
    background: 'transparent', color: 'var(--text-primary)',
    border: 'none', borderRadius: 4, cursor: 'pointer',
    textAlign: 'left', fontSize: 12.5,
  },
  itemIcon: { fontSize: 18, lineHeight: 1, width: 22, textAlign: 'center' },
  itemBody: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 1 },
  itemLabel: { fontWeight: 500 },
  itemHint: { fontSize: 10.5, color: 'var(--text-tertiary)' },
  itemHotkey: {
    fontSize: 10, fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-tertiary)', minWidth: 16, textAlign: 'right',
  },
};
