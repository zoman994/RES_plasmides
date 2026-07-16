/**
 * SearchModeSelector — K2.1. The §9.2 grouped mode dropdown. UI-only: driven by
 * pre-gated, label-resolved `groups` props (the surface resolves i18n + provider
 * capability; this component renders and navigates). A trigger button opens a
 * role=listbox whose group labels are presentational separators and whose modes
 * are role=option; keyboard, active-descendant and the mouse contract reuse the
 * K1 headless navigation + shared option-id formula. Selection closes the popup
 * and returns focus to the trigger.
 *
 * Fail-closed like K1: `assertUniqueOptionKeys` throws if two modes collapse to
 * one id; `disabled` cannot open; aria-activedescendant only points at a real
 * option while open.
 *
 * UI-only: React + the project Icon + in-cluster siblings.
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes).
 */
import React, { useId, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { useSearchComboboxNavigation } from './useSearchComboboxNavigation';
import { optionDomId, assertUniqueOptionKeys } from './searchUiContract';

const getModeKey = (m) => m.id;

export default function SearchModeSelector({
  groups = [],
  selectedModeId,
  onSelectMode,
  triggerLabel,
  ariaLabel,
  disabled = false,
  listboxId: listboxIdProp,
  testId = 'search-mode',
}) {
  const autoId = useId();
  const listboxId = listboxIdProp || `search-mode-listbox-${autoId}`;
  const triggerRef = useRef(null);

  const flatModes = groups.flatMap((g) => g.modes || []);
  // Fail closed on ambiguous identity before anything renders/navigates.
  assertUniqueOptionKeys(flatModes, getModeKey);

  const [openState, setOpenState] = useState(false);
  if (disabled && openState) setOpenState(false); // disabling closes
  const popupOpen = openState && !disabled;

  const handleSelect = (mode) => {
    onSelectMode?.(mode.id);
    setOpenState(false);
    triggerRef.current?.focus();
  };

  const nav = useSearchComboboxNavigation({
    items: flatModes,
    getOptionKey: getModeKey,
    open: popupOpen,
    onOpenChange: setOpenState,
    onSelect: handleSelect,
    disabled,
    sessionKey: 'modeSelector', // one persistent session — modes don't churn
  });

  const activeDescendantId = popupOpen && nav.activeKey != null
    ? optionDomId(listboxId, nav.activeKey)
    : undefined;

  return (
    <div data-testid={testId} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={`${testId}-trigger`}
        disabled={disabled}
        // Select-only combobox (W3C): the trigger IS the combobox — focus and
        // aria-activedescendant live here; the popup is the listbox. One pattern,
        // not a plain button carrying an activedescendant it has no role for.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={popupOpen ? 'true' : 'false'}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId || undefined}
        aria-label={ariaLabel}
        onClick={() => { if (!disabled) setOpenState((o) => !o); }}
        onKeyDown={nav.onKeyDown}
        onBlur={() => setOpenState(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', fontSize: 12,
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-default)', borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span>{triggerLabel}</span>
        <Icon name="chevron-down" size={13} />
      </button>

      {popupOpen && (
        <ul
          data-testid={`${testId}-listbox`}
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 2,
            listStyle: 'none', margin: 0, padding: '4px 0', minWidth: 180,
            background: 'var(--surface-1)', border: '1px solid var(--border-default)',
            borderRadius: 8, boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))',
          }}
        >
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <li
                role="presentation"
                style={{
                  padding: '4px 10px 2px', fontSize: 10, fontWeight: 600,
                  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4,
                }}
              >{group.label}</li>
              {(group.modes || []).map((mode) => {
                const active = nav.activeKey === mode.id;
                const selected = mode.id === selectedModeId;
                return (
                  <li
                    key={mode.id}
                    id={optionDomId(listboxId, mode.id)}
                    role="option"
                    aria-selected={selected ? 'true' : 'false'}
                    onMouseDown={(e) => { if (e.button === 0) e.preventDefault(); }}
                    onClick={() => handleSelect(mode)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                      background: active ? 'var(--surface-2)' : 'transparent',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ flex: '0 0 14px', display: 'inline-flex' }}>
                      {selected ? <Icon name="check" size={13} /> : null}
                    </span>
                    <span>{mode.label}</span>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
