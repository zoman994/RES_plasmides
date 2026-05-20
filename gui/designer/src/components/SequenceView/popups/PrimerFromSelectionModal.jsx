/**
 * PrimerFromSelectionModal — Игорь 18.05.2026: «при нажатии добавить
 * праймер должно открываться окно с возможностью редактирования
 * праймера, его имени и RC».
 *
 * Opened by SequenceView when the user triggers "primer" on a
 * selection (right-click menu). Pre-filled with the selected DNA
 * (RC-oriented for a reverse primer). Editable: name, sequence, and
 * the RC/direction toggle (flipping it reverse-complements the field).
 * Esc / backdrop close (ui-interactions modal contract).
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { reverseComplement } from "../../../sequence-utils.js";

// K13 — quick-add helper sets (SPEC §3 шаг 3 PrimerFromSelectionModal
// extension). Sequences from K2 snippet-catalog + restriction-db.
const HELPER_SNIPPETS = [
  ['6xHis', 'CATCATCATCATCATCAT'],
  ['FLAG', 'GATTACAAGGATGACGATGACAAG'],
  ['Kozak-ATG', 'GCCACCATG'],
];
const HELPER_RE = [
  ['EcoRI', 'GAATTC'],
  ['NotI', 'GCGGCCGC'],
  ['BamHI', 'GGATCC'],
];

function cleanDna(s) {
  return String(s || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

export default function PrimerFromSelectionModal({ draft, onCreate, onClose }) {
  // `draft.name` seeds the field when opened from an EXISTING primer
  // (double-click); empty for the create-from-selection path.
  const [name, setName] = useState(draft.name || "");
  // K13 — split into tail (5' overhang) + binding (anneals to template).
  // Back-compat: if draft.tail exists use it; otherwise the legacy
  // `draft.sequence` is treated as the binding region.
  const [tail, setTail] = useState(draft.tail || "");
  const [binding, setBinding] = useState(draft.binding || draft.sequence || "");
  const [direction, setDirection] = useState(draft.direction || "forward");

  // Esc is handled HERE (React keydown on the backdrop), NOT via a
  // window listener: the backdrop must stopPropagation keydown (so
  // SequenceView's root onKeyDown doesn't eat typed letters — bug2),
  // and React's stopPropagation also stops native bubbling, which
  // would kill a window-level Esc listener (Игорь 18.05.2026 «отвалились
  // хоткеи»). Handling Esc in-handler keeps close working AND keeps
  // bubble-phase window hotkeys from firing through an open modal.
  const onModalKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    e.stopPropagation();
  };

  const toggleRc = () => {
    const next = direction === "reverse" ? "forward" : "reverse";
    setDirection(next);
    // K13 — RC affects the BINDING (anneals to template) only. The tail
    // is a 5' overhang regardless of which strand we prime from, so it
    // stays. Re-orient the binding so it always reads 5'→3' on the
    // chosen strand.
    setBinding((b) => reverseComplement(cleanDna(b)));
  };

  const cleanTail = cleanDna(tail);
  const cleanBinding = cleanDna(binding);
  const fullSeq = cleanTail + cleanBinding;

  const submit = () => {
    onCreate({
      name: name.trim(),
      sequence: fullSeq,
      direction,
      tail: cleanTail,
      binding: cleanBinding,
    });
  };

  const appendTail = (snippet) => setTail((t) => cleanDna(t) + snippet);

  // Игорь 18.05.2026: «модалка "прозрачная" для клика, кнопки не
  // жмутся». Тот же корень, что и у keydown: React распускает события
  // по дереву компонентов, не по DOM — pointerdown/up/click из портала
  // всплывают в `<div onPointerDown={onRootPointerDown}>` корня
  // SequenceView, тот стартует drag-select / pointer-capture и
  // «крадёт» взаимодействие, click по кнопке не завершается. Гасим
  // pointer/contextmenu в пределах модала (click для backdrop-close
  // на самом backdrop остаётся — это отдельное событие на нём же).
  const stopPtr = (e) => e.stopPropagation();

  // Игорь 18.05.2026: модалка появлялась «в центре последовательности
  // и до неё надо скролить», ввод имени был неактивен — корень: рендер
  // внутри scroll/pointer-контекста SequenceView с position:absolute.
  // Фикс — портал в document.body + position:fixed: настоящий
  // viewport-центрированный модал вне stacking/user-select вьювера.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      data-testid="primer-from-selection-modal"
      onClick={onClose}
      onPointerDown={stopPtr}
      onPointerUp={stopPtr}
      onPointerMove={stopPtr}
      onContextMenu={stopPtr}
      // Игорь 18.05.2026: «имя так же не печатается». React распускает
      // события по ДЕРЕВУ КОМПОНЕНТОВ, не по DOM — портал в body НЕ
      // выводит keydown из-под `<div onKeyDown>` SequenceView'а
      // (useSequenceKeyboard в editable-режиме делает preventDefault на
      // каждую IUPAC-букву A/C/G/T/N/… → инпут их не получает). Гасим
      // распространение keydown в пределах модала: ввод работает,
      // sequence-edit вьювера не срабатывает. Esc — нативный
      // window-listener, синтетический stopPropagation его не трогает.
      onKeyDown={onModalKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(28,25,23,0.32)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, background: "var(--surface-1)", color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)", borderRadius: 8,
          boxShadow: "0 8px 28px rgba(28,25,23,0.24)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            {draft.name ? `Праймер: ${draft.name}` : "Новый праймер из выделения"}
          </strong>
          <button type="button" data-testid="primer-modal-cancel-x" onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={lbl}>
            Имя (необязательно)
            <input
              data-testid="primer-modal-name"
              type="text"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="авто-имя если пусто"
              style={inp}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Направление</span>
            <button
              type="button"
              data-testid="primer-modal-rc"
              onClick={toggleRc}
              title="Reverse-complement"
              style={{
                ...ghostBtn,
                fontWeight: 600,
                color: direction === "reverse" ? "#dc2626" : "#3b82f6",
                borderColor: direction === "reverse" ? "#dc2626" : "#3b82f6",
              }}
            >
              {direction === "reverse" ? "◀ Reverse (RC)" : "▶ Forward"}
            </button>
          </div>

          {/* K13 — separate 5'-tail field (overhang, not bound on template)
              + binding region (5'→3' on chosen strand). The full primer
              sequence is tail + binding, shown in the split viz. */}
          <label style={lbl}>
            5'-tail (overhang)
            <textarea
              data-testid="primer-modal-tail"
              value={tail}
              onChange={(e) => setTail(e.target.value)}
              rows={2}
              placeholder="опц — обвес / RE-сайт / Gibson-overlap"
              style={{
                width: "100%", marginTop: 4, fontFamily: "var(--font-mono, monospace)",
                fontSize: 12, padding: 8,
                border: "1px solid var(--accent-500, #b85c3e)",
                borderRadius: 4, background: "var(--accent-wash, rgba(184,92,62,0.06))",
                color: "var(--text-primary)", resize: "vertical", outline: "none",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginRight: 4 }}>Обвес:</span>
            {HELPER_SNIPPETS.map(([n, s]) => (
              <button
                key={n}
                type="button"
                data-testid={`primer-modal-helper-snippet-${n}`}
                onClick={() => appendTail(s)}
                style={helperBtn}
              >+ {n}</button>
            ))}
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 4px" }}>·</span>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginRight: 4 }}>RE:</span>
            {HELPER_RE.map(([n, s]) => (
              <button
                key={n}
                type="button"
                data-testid={`primer-modal-helper-re-${n}`}
                onClick={() => appendTail(s)}
                style={helperBtn}
              >+ {n}</button>
            ))}
          </div>

          <label style={lbl}>
            Binding region (anneals to template, 5'→3')
            <textarea
              data-testid="primer-modal-seq"
              value={binding}
              onChange={(e) => setBinding(e.target.value)}
              rows={3}
              style={{
                width: "100%", marginTop: 4, fontFamily: "var(--font-mono, monospace)",
                fontSize: 12, padding: 8, border: "1px solid var(--border-subtle)",
                borderRadius: 4, background: "var(--surface-2)", color: "var(--text-primary)",
                resize: "vertical", outline: "none",
              }}
            />
          </label>

          <div
            data-testid="primer-modal-tail-binding-viz"
            style={{
              display: "flex", alignItems: "stretch", height: 24,
              border: "1px solid var(--border-subtle)", borderRadius: 4, overflow: "hidden",
            }}
          >
            <div style={{
              flexBasis: `${Math.max(8, cleanTail.length * 4)}px`,
              background: "var(--accent-wash, rgba(184,92,62,0.30))",
              color: "var(--accent-700, #8a3a22)",
              fontSize: 10, padding: "4px 6px", whiteSpace: "nowrap",
            }}>tail {cleanTail.length}</div>
            <div style={{
              flex: 1,
              background: "var(--surface-2)",
              color: "var(--text-secondary)",
              fontSize: 10, padding: "4px 6px", whiteSpace: "nowrap",
            }}>binding {cleanBinding.length} · Σ {fullSeq.length} нт</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="primer-modal-cancel" onClick={onClose} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="primer-modal-create" onClick={submit} style={primaryBtn}>Создать</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const lbl = { display: "flex", flexDirection: "column", fontSize: 11, color: "var(--text-secondary)" };
const inp = {
  marginTop: 4, fontSize: 12, padding: "5px 8px", border: "1px solid var(--border-subtle)",
  borderRadius: 4, background: "var(--surface-2)", color: "var(--text-primary)", outline: "none",
};
const ghostBtn = {
  fontSize: 11, padding: "4px 10px", background: "transparent",
  border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)",
};
const helperBtn = {
  fontSize: 10, padding: "2px 8px", background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)", borderRadius: 999,
  cursor: "pointer", color: "var(--text-secondary)",
};
const primaryBtn = {
  fontSize: 11.5, padding: "5px 16px", background: "var(--accent-500, #b85c3e)",
  color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
};
