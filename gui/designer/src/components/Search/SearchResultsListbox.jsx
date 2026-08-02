/**
 * SearchResultsListbox — K1.2. The SOLE owner of role="listbox" / role="option",
 * the option id (via the shared `optionDomId` formula, keyed by the stable
 * option key so it follows the entity through a reorder), aria-selected, and
 * mouse selection.
 *
 * `renderOption(item, { active, index })` is EXPECTED to return non-interactive
 * content — the <li> is the interactive option, so a row must not nest a
 * button/link/input. This component does not add interactivity of its own (it
 * never wraps the row in a control), but it cannot enforce what a caller returns
 * from renderOption; the real K4 renderer therefore carries its own
 * non-interactive contract test. (This is why SmartResultRow — itself a
 * <button role=option> — is NOT reused here.)
 *
 * STATUS OWNERSHIP (K3.2): this component does NOT decide what the search is saying.
 * It renders exactly ONE caller-supplied `statusContent` inside a single
 * role="status" aria-live="polite" region OUTSIDE the <ul> — never as an option.
 * It used to take separate `loadingContent` / `diagnostic` / `emptyContent` and rank
 * them itself (`isEmpty && !loading && !diagnostic && …`), which made it a SECOND
 * owner of precedence: the caller could conclude «the check did not run» while this
 * component independently rendered «nothing found» from the same session. Business
 * precedence now lives in ONE pure projection (lib/search-session-presentation) that
 * the caller reads; the caller passes the winner down as `statusContent`.
 *
 * `loading` survives only as the source of `aria-busy` on the results area.
 *
 * Mouse contract: left mousedown only prevents default (so the input keeps
 * focus); selection fires on click exactly once; the right button never selects.
 * When `disabled`, no click selects (defense in depth: the combobox also refuses
 * to render the popup while disabled).
 *
 * UI-only: React + design tokens; no store/parser/facade/worker/adapter imports.
 */
import React from 'react';
import { optionDomId, defaultGetOptionKey, assertUniqueOptionKeys } from './searchUiContract';

export default function SearchResultsListbox({
  id,
  items = [],
  activeIndex = -1,
  onActiveIndexChange,
  onSelect,
  renderOption,
  getOptionKey = defaultGetOptionKey,
  disabled = false,
  loading = false,
  statusContent = null,
  testId = 'search-listbox',
}) {
  // Fail closed on ambiguous identity BEFORE rendering: two options that resolve
  // to the same key would share a React key / DOM id / active target.
  assertUniqueOptionKeys(items, getOptionKey);

  return (
    <div
      data-testid={`${testId}-results`}
      aria-busy={loading ? 'true' : undefined}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <ul
        data-testid={testId}
        id={id}
        role="listbox"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <li
              key={getOptionKey(item, index)}
              id={optionDomId(id, getOptionKey(item, index))}
              role="option"
              aria-selected={active ? 'true' : 'false'}
              // A disabled list is announced as such per option, so assistive tech never offers
              // an option the mouse/keyboard contract below refuses to select (e.g. a still-
              // unconfirmed biological candidate during the metadata phase).
              aria-disabled={disabled ? 'true' : undefined}
              // Keep focus on the input: prevent the default focus shift a
              // mousedown on the option would cause. Left button only, enabled only.
              onMouseDown={(e) => { if (!disabled && e.button === 0) e.preventDefault(); }}
              // U5-A — pointing AT an option makes it the active one. Hover and keyboard focus are
              // therefore the SAME state, rendered by the SAME component from the SAME view-model:
              // there is no second, hover-only summary that could disagree with the focused one, and
              // `aria-activedescendant` follows the mouse so what a screen reader announces is what
              // the sighted user is pointing at. Inert while disabled, like every other path here.
              onMouseEnter={() => { if (!disabled) onActiveIndexChange?.(index); }}
              // Selection is a single click of the primary button; contextmenu
              // (right button) fires no onClick, so it never selects. No-op while disabled.
              onClick={() => { if (!disabled) onSelect?.(item, index); }}
              style={{
                cursor: disabled ? 'default' : 'pointer',
                background: active ? 'var(--surface-2)' : 'transparent',
              }}
            >
              {renderOption?.(item, { active, index })}
            </li>
          );
        })}
      </ul>

      {/* The ONE status owner of the result area: one region, one message, chosen by the caller.
          Nothing here is ever an option. */}
      <div
        data-testid={`${testId}-status`}
        role="status"
        aria-live="polite"
        style={{ color: 'var(--text-tertiary)', fontSize: 10.5 }}
      >
        {statusContent}
      </div>
    </div>
  );
}
