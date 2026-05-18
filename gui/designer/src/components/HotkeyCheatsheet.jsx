/**
 * HotkeyCheatsheet — overlay listing every registered hotkey (UX-037).
 *
 * Triggered from the Topbar `?` button. Renders a modal with two
 * columns (label + key combo) backed by `lib/hotkeys.js` so it never
 * drifts out of sync with the actual registry.
 *
 * Closes on Esc, backdrop click, or the close button. No store state —
 * a parent prop drives `open`.
 */
import { useEffect } from 'react';
import { HOTKEYS, formatHotkey } from '../lib/hotkeys';
import { STRINGS } from '../lib/strings';

export default function HotkeyCheatsheet({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const entries = Object.entries(HOTKEYS).map(([id, h]) => ({
    id,
    label: h.label || id,
    combo: formatHotkey(id),
  }));

  return (
    <div
      data-testid="hotkey-cheatsheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={STRINGS.hotkeyCheatsheet?.title || 'Keyboard shortcuts'}
      onClick={onClose}
      className="modal-anim-backdrop"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="hotkey-cheatsheet"
        onClick={(e) => e.stopPropagation()}
        className="modal-anim-body"
        style={{
          background: 'var(--surface-1, #fff)',
          color: 'var(--text-primary, #111)',
          padding: '20px 24px',
          borderRadius: 'var(--radius-md, 6px)',
          minWidth: 360,
          maxWidth: 520,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
            {STRINGS.hotkeyCheatsheet?.title || 'Keyboard shortcuts'}
          </h2>
          <button
            type="button"
            data-testid="hotkey-cheatsheet-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--text-secondary)', padding: '0 4px',
            }}
          >×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {entries.map(({ id, label, combo }) => (
              <tr key={id} style={{ borderBottom: '0.5px solid var(--border-subtle, #eee)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{label}</td>
                <td style={{
                  padding: '6px 8px', textAlign: 'right',
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'var(--text-secondary)',
                }}>{combo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {STRINGS.hotkeyCheatsheet?.browserOverrideNote && (
          <p
            data-testid="hotkey-cheatsheet-browser-note"
            style={{
              margin: '12px 0 0', fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '8px 10px',
              background: 'var(--surface-2)',
              borderRadius: 4,
              borderLeft: '2px solid var(--accent-500)',
            }}
          >{STRINGS.hotkeyCheatsheet.browserOverrideNote}</p>
        )}
        <p style={{
          margin: '12px 0 0', fontSize: 11,
          color: 'var(--text-tertiary)', fontStyle: 'italic',
        }}>
          {STRINGS.hotkeyCheatsheet?.hint || 'Press Esc to close.'}
        </p>
      </div>
    </div>
  );
}
