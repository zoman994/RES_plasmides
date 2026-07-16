/**
 * SearchCombobox — K1.4. Composes SearchField (K1.1) +
 * useSearchComboboxNavigation (K1.3) + SearchResultsListbox (K1.2) into the
 * shared combobox primitive.
 *
 * ONE lifecycle contract (round-2): the COMBOBOX owns `open` (uncontrolled),
 * matching the K1.0 ownership split — the combobox owns transient UI state
 * (open, active option, composition), the surface owns query / results / session.
 * It opens on arrow/type and closes on blur (click-away) / Escape / selection /
 * Tab, and always returns focus to the input after a selection. `onOpenChange`
 * is a NOTIFICATION for the surface, not a control input.
 *
 * A default listbox id is unique per instance (useId) so two comboboxes never
 * collide; aria-activedescendant is computed from the ACTIVE KEY (stable across
 * a partial→final reorder) and is present only while the popup is open — so it
 * never dangles. While `disabled`, the popup is not rendered and nothing can be
 * navigated or selected.
 *
 * UI-only: React + the three sibling primitives; no store/parser/facade/worker.
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import SearchField from './SearchField';
import SearchResultsListbox from './SearchResultsListbox';
import { useSearchComboboxNavigation } from './useSearchComboboxNavigation';
import { optionDomId, defaultGetOptionKey } from './searchUiContract';

function assignRef(ref, node) {
  if (!ref) return;
  if (typeof ref === 'function') ref(node);
  else ref.current = node;
}

export default function SearchCombobox({
  value = '',
  onValueChange,
  items = [],
  getOptionKey = defaultGetOptionKey,
  renderOption,
  onSelect,
  onUnhandledKeyDown,
  onOpenChange,
  listboxId: listboxIdProp,
  sessionKey,
  textOnly = false,
  openOnType = true,
  // SearchField pass-through
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  busy = false,
  invalid = false,
  disabled = false,
  resultCount = null,
  leadingSlot = null,
  modeSlot = null,
  filterChips = null,
  onClear,
  clearAriaLabel,
  inputRef,
  onFocus,
  onBlur,
  // Listbox states
  loading = false,
  statusContent = null,
  testId = 'search-combobox',
}) {
  const autoId = useId();
  const listboxId = listboxIdProp || `search-listbox-${autoId}`;
  const innerInputRef = useRef(null);

  // Session identity is MANDATORY for a general combobox: with unchanged text the
  // scope / profile / filters / result-generation can still change, and a stale
  // activeKey must not survive that. `value` alone is a valid boundary ONLY for
  // an explicitly text-only surface.
  let effectiveSessionKey;
  if (sessionKey !== undefined) effectiveSessionKey = sessionKey;
  else if (textOnly) effectiveSessionKey = value;
  else {
    throw new Error(
      'SearchCombobox requires `sessionKey` (full session identity: scope + '
      + 'profile + filters + generation + query). Pass `textOnly` for a plain '
      + 'text-filter surface, where `value` is the session boundary.',
    );
  }

  const [openState, setOpenState] = useState(false);
  // Disabling fully closes the popup (render-time, pure state update) so a later
  // re-enable does not resurrect the old results without a user action.
  if (disabled && openState) setOpenState(false);
  const popupOpen = openState && !disabled;

  const setOpen = (next) => setOpenState(next);

  // Notify the surface of the EFFECTIVE open state from a single channel, so a
  // disable-driven close (which bypasses setOpen) still reaches the observer —
  // it can never be left thinking the popup is open. The ref keeps the latest
  // callback without re-firing on every parent render.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => { onOpenChangeRef.current?.(popupOpen); }, [popupOpen]);

  const handleSelect = (item, index) => {
    onSelect?.(item, index);
    setOpen(false);
    innerInputRef.current?.focus(); // guarantee focus returns to the input
  };

  const nav = useSearchComboboxNavigation({
    items,
    getOptionKey,
    open: popupOpen,
    onOpenChange: setOpen,
    onSelect: handleSelect,
    onUnhandledKeyDown,
    disabled,
    sessionKey: effectiveSessionKey,
  });

  const activeDescendantId = popupOpen && nav.activeKey != null
    ? optionDomId(listboxId, nav.activeKey)
    : undefined;

  const mergedInputRef = (node) => {
    innerInputRef.current = node;
    assignRef(inputRef, node);
  };

  const handleValueChange = (val, meta) => {
    onValueChange?.(val, meta);
    if (openOnType && !disabled) setOpen(true);
  };

  const handleBlur = (e) => {
    setOpen(false); // click-away / focus-out closes the popup
    onBlur?.(e);
  };

  return (
    <div data-testid={testId} style={{ position: 'relative' }}>
      <SearchField
        value={value}
        onValueChange={handleValueChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        ariaDescribedBy={ariaDescribedBy}
        busy={busy}
        invalid={invalid}
        disabled={disabled}
        resultCount={resultCount}
        leadingSlot={leadingSlot}
        modeSlot={modeSlot}
        filterChips={filterChips}
        onClear={onClear}
        clearAriaLabel={clearAriaLabel}
        inputRef={mergedInputRef}
        role="combobox"
        ariaAutoComplete="list"
        ariaExpanded={popupOpen}
        controlsId={listboxId}
        activeDescendantId={activeDescendantId}
        onKeyDown={nav.onKeyDown}
        onFocus={onFocus}
        onBlur={handleBlur}
        onCompositionStart={nav.compositionHandlers.onCompositionStart}
        onCompositionEnd={nav.compositionHandlers.onCompositionEnd}
      />

      {popupOpen && (
        <SearchResultsListbox
          id={listboxId}
          items={items}
          getOptionKey={getOptionKey}
          activeIndex={nav.activeIndex}
          onSelect={handleSelect}
          renderOption={renderOption}
          disabled={disabled}
          loading={loading}
          statusContent={statusContent}
        />
      )}
    </div>
  );
}
