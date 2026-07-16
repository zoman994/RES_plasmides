/**
 * useSearchComboboxNavigation — K1.3. The headless keyboard + composition core
 * shared by every search combobox. It owns TRANSIENT UI state only: the active
 * option tracked by a STABLE key (never index — a partial→final swap reorders
 * results) and the composition flag. It renders nothing and imports nothing from
 * the store/parser/facade/worker.
 *
 * ARIA-navigation contract:
 *   • ArrowDown on a closed popup opens it and activates the first option;
 *     ArrowUp opens and activates the last.
 *   • ArrowUp/Down move the active option, clamped at the ends (no wrap).
 *   • Home/End jump to first/last only while open; when closed they fall through
 *     to the input's caret behaviour (no preventDefault).
 *   • Enter selects only an EXISTING active option; otherwise it defers to the
 *     surface seam (free-text submit lives there, K4).
 *   • Escape only closes the popup — it never clears the query — and drops the
 *     active option.
 *   • Tab closes the popup WITHOUT preventDefault, so focus moves away.
 *
 * Active-key scope (session): the active option is preserved through a
 * partial→final reorder WITHIN one query (activeIndex follows the key), but is
 * RESET when a new query starts. `sessionKey` identifies the query — bump it per
 * new search and a stale active entity cannot resurrect when it happens to
 * reappear in the next query's results. While the active entity is transiently
 * absent within a session, activeIndex is -1 so the combobox emits no
 * aria-activedescendant (no dangling); if it returns in the same session it
 * re-activates by key.
 *
 * IME safety: the guard uses BOTH a ref (compositionstart/end) AND
 * event.nativeEvent.isComposing. Before compositionend nothing is intercepted —
 * not Enter, arrows, `:`, nor the surface seam — so an IME (e.g. Cyrillic
 * composite input) commits normally instead of the keystroke being swallowed.
 *
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes).
 */
import { useRef, useState } from 'react';
import { defaultGetOptionKey, resolveActiveIndex } from './searchUiContract';

export function useSearchComboboxNavigation({
  items = [],
  getOptionKey = defaultGetOptionKey,
  open = false,
  onOpenChange,
  onSelect,
  onUnhandledKeyDown,
  disabled = false,
  sessionKey,
}) {
  const [activeKeyState, setActiveKey] = useState(null);
  const composingRef = useRef(false);

  // Reset the active option when a new query begins (session boundary). This is
  // the React-sanctioned "adjust state during render on prop change" pattern —
  // NOT an effect (AGENTS.md §244 / react-hooks/set-state-in-effect).
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    setActiveKey(null);
  }

  // Disabling clears the active option (render-time, not an effect) so a later
  // re-enable never resurrects the old selection without a user action.
  if (disabled && activeKeyState !== null) {
    setActiveKey(null);
  }

  const activeIndex = resolveActiveIndex(items, activeKeyState, getOptionKey);
  // Active identity is DERIVED. While the active entity is absent from the list
  // (or the control is disabled), activeKey reads null: no dangling
  // aria-activedescendant and Enter won't fire.
  const activeKey = (!disabled && activeIndex >= 0) ? activeKeyState : null;

  const activateIndex = (idx) => {
    const count = items.length;
    if (count === 0) { setActiveKey(null); return; }
    const clamped = Math.max(0, Math.min(count - 1, idx));
    setActiveKey(getOptionKey(items[clamped], clamped));
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    // IME guard — do not touch anything until composition ends.
    if (composingRef.current || e?.nativeEvent?.isComposing) return;

    const { key } = e;
    const count = items.length;

    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { onOpenChange?.(true); activateIndex(0); return; }
        activateIndex(activeIndex < 0 ? 0 : activeIndex + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { onOpenChange?.(true); activateIndex(count - 1); return; }
        activateIndex(activeIndex < 0 ? count - 1 : activeIndex - 1);
        return;
      case 'Home':
        if (!open) return; // let the input move its caret
        e.preventDefault();
        activateIndex(0);
        return;
      case 'End':
        if (!open) return;
        e.preventDefault();
        activateIndex(count - 1);
        return;
      case 'Enter':
        if (open && activeIndex >= 0 && items[activeIndex] != null) {
          e.preventDefault();
          onSelect?.(items[activeIndex], activeIndex);
        } else {
          onUnhandledKeyDown?.(e);
        }
        return;
      case 'Escape':
        // Stop propagation so closing the popup does not ALSO close a parent
        // modal/dialog listening for Escape.
        if (open) { e.preventDefault(); e.stopPropagation?.(); onOpenChange?.(false); setActiveKey(null); }
        else onUnhandledKeyDown?.(e);
        return;
      case 'Tab':
        if (open) onOpenChange?.(false); // never preventDefault — focus leaves
        return;
      default:
        onUnhandledKeyDown?.(e); // e.g. ':' — prefix semantics wire in here (K3)
    }
  };

  const compositionHandlers = {
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: () => { composingRef.current = false; },
  };

  return {
    activeKey,
    activeIndex,
    setActiveKey,
    resetActive: () => setActiveKey(null),
    onKeyDown,
    compositionHandlers,
    isComposing: () => composingRef.current,
  };
}

export default useSearchComboboxNavigation;
