/**
 * SelectionContextMenu — right-click menu shown when biolog
 * right-clicks on an active selection in SequenceView. Three
 * tri-modal copy actions (DEC-SV-04):
 *   - «Копировать (прямая цепь)»          Ctrl+C
 *   - «Копировать обратную цепь»          Ctrl+Alt+C
 *   - «Копировать аминокислоты»           Ctrl+Shift+C
 *     (disabled unless selectionMode === 'aa' — biolog 04.05.2026
 *      evening: «когда выделяешь ДНК просто скопировать АК делать
 *      неактивную при нажатии правой кнопки мыши»).
 *
 * Sprint M-X.2 K9 will add an «Аннотировать выделение...» item that
 * dispatches the openAnnotator action — the menu structure is
 * already extracted in K1 so K9 needs only an additional `<MenuItem>`.
 *
 * Critical: the menu div stops propagation on EVERY pointer event
 * (pointerdown / mousedown / click / contextmenu) — without this,
 * the SequenceView root handlers would collapse the selection
 * BEFORE the menu's onClick fires (biolog 04.05.2026 evening:
 * «когда пытаюсь скопировать через контекстное меню клик
 * обрабатывается на сиквенсе. поэтому нажать его нельзя»).
 *
 * Extracted from `SequenceView/index.jsx` in Sprint M-X.2 K1
 * decomposition.
 */

export default function SelectionContextMenu({
  contextMenu,
  selectionMode,
  onCopy,
  onClose,
  extraItems,
}) {
  if (!contextMenu) return null;
  return (
    <div
      data-testid="sequence-view-context-menu"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: contextMenu.x,
        top: contextMenu.y,
        background: "var(--surface-1, #fff)",
        border: "0.5px solid var(--border-default, #d4d4d4)",
        borderRadius: "var(--radius-md, 6px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        padding: "4px 0",
        minWidth: 220,
        zIndex: 100,
        fontSize: 12,
        userSelect: "none",
      }}
    >
      <MenuItem
        label="Копировать (прямая цепь)"
        shortcut="Ctrl+C"
        onClick={() => { onCopy("forward"); onClose(); }}
      />
      <MenuItem
        label="Копировать обратную цепь"
        shortcut="Ctrl+Alt+C"
        onClick={() => { onCopy("reverse"); onClose(); }}
      />
      <MenuItem
        label="Копировать аминокислоты"
        shortcut="Ctrl+Shift+C"
        disabled={selectionMode !== "aa"}
        onClick={() => { onCopy("aa"); onClose(); }}
      />
      {Array.isArray(extraItems) && extraItems.length > 0 ? (
        <>
          <div
            role="separator"
            style={{
              borderTop: "0.5px solid var(--border-default, #d4d4d4)",
              margin: "4px 0",
            }}
          />
          {extraItems.map((item) => (
            <MenuItem
              key={item.key || item.label}
              label={item.label}
              shortcut={item.shortcut || ""}
              disabled={!!item.disabled}
              onClick={() => { item.onClick?.(); onClose(); }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function MenuItem({ label, shortcut, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={!!disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "6px 14px",
        border: "none",
        background: "transparent",
        color: disabled ? "var(--text-tertiary, #999)" : "var(--text-primary, #111)",
        fontSize: 12,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        gap: 12,
      }}
      onMouseEnter={disabled ? undefined : (e) => { e.currentTarget.style.background = "var(--surface-2, #f5f5f4)"; }}
      onMouseLeave={disabled ? undefined : (e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span>{label}</span>
      <span style={{
        color: disabled ? "var(--text-tertiary, #bbb)" : "var(--text-tertiary, #999)",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 10,
      }}>
        {shortcut}
      </span>
    </button>
  );
}
