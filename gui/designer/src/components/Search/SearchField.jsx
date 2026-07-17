/**
 * SearchField — K1.1. The UI-only field shell of the search primitives (§1A.2).
 *
 * It owns NO data and imports nothing from the store/parser/facade/worker —
 * only React, the project Icon, and design tokens. It renders an <input> plus
 * optional slots (leading / mode / filter-chips), a busy indicator, a result
 * count, and a clear control. The combobox ARIA (role, aria-autocomplete,
 * aria-expanded, aria-controls, aria-activedescendant, aria-describedby) is a
 * pass-through channel applied to the <input> itself — never to the wrapper —
 * so a surface combobox controller and a plain filter field share the same
 * shell.
 *
 * IME safety runs deeper than the keyboard: `onChange` reports
 * `onValueChange(value, { isComposing, inputType })` so the controller/parser can
 * defer interpreting an intermediate ':' until compositionend, and can distinguish a
 * PASTE (`inputType==='insertFromPaste'`) from ordinary typing — a paste commits its
 * value in the SAME change (a browser `paste` fires before `change`). All user-facing
 * strings (placeholder, aria-labels, clear label) arrive via props — nothing hardcoded.
 *
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes).
 */
import React, { useRef } from 'react';
import { Icon } from '../icons/Icon';
import { hasText } from './searchUiContract';

// Screen-reader-only: present to assistive tech, invisible on screen.
const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

// Merge the caller's inputRef (object or callback) with our internal ref so we
// can return focus to the input after a clear while still forwarding it out.
function assignRef(ref, node) {
  if (!ref) return;
  if (typeof ref === 'function') ref(node);
  else ref.current = node;
}

export default function SearchField({
  value = '',
  onValueChange,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  onClear,
  clearAriaLabel,
  busy = false,
  disabled = false,
  invalid = false,
  resultCount = null,
  resultCountLabel,
  leadingSlot = null,
  modeSlot = null,
  filterChips = null,
  inputRef,
  controlsId,
  activeDescendantId,
  onKeyDown,
  onFocus,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  role,
  ariaAutoComplete,
  ariaExpanded,
  testId = 'search-field',
}) {
  const internalRef = useRef(null);
  const composingRef = useRef(false);
  // One-shot guard for the browser input event that may immediately follow
  // compositionend. This is deliberately not a global value deduplicator:
  // the same text entered again after a controlled clear is a new user action.
  const postCompositionCommitRef = useRef(null);

  const setInputNode = (node) => {
    internalRef.current = node;
    assignRef(inputRef, node);
  };

  // Fail-closed a11y: the clear control renders only with a NON-BLANK localized
  // accessible name — never an unnamed (or whitespace-named) icon button.
  const showClear = !disabled && !!onClear && hasText(clearAriaLabel) && value !== '' && value != null;
  // The count is announced, not just drawn: shown only with a localized label.
  const showCount = Number.isFinite(resultCount) && hasText(resultCountLabel);

  const handleClear = () => {
    postCompositionCommitRef.current = null;
    onClear?.();
    // A clear is a within-field action — focus stays on the input so the user
    // keeps typing without reaching for the mouse.
    internalRef.current?.focus();
  };

  // Emit normally. De-duplication is scoped to the one possible
  // post-composition browser event in handleChange below.
  const emit = (val, isComposing, inputType) => {
    onValueChange?.(val, { isComposing, inputType });
  };

  const handleChange = (e) => {
    // Composition metadata (ref set by compositionstart/end, plus the native
    // flag) so the parser can skip interpreting a mid-IME ':'; the native
    // inputType lets the controller commit a paste in this same change.
    const isComposing = composingRef.current || !!e.nativeEvent?.isComposing;
    const inputType = e.nativeEvent?.inputType;
    const postCompositionValue = postCompositionCommitRef.current;
    postCompositionCommitRef.current = null;
    // Suppress the browser's one immediate duplicate of compositionEnd even when
    // the controller has already canonicalized the controlled value (for example
    // `aa:HHHH ` becomes visible `HHHH`). Real clear actions explicitly reset the
    // guard in handleClear, so the same text can be entered again afterwards.
    if (
      !isComposing
      && postCompositionValue === e.target.value
      && inputType !== 'insertFromPaste'
    ) return;
    emit(e.target.value, isComposing, inputType);
  };

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        background: 'var(--surface-1)',
        border: `1px solid ${invalid ? 'var(--danger-fg)' : 'var(--border-default)'}`,
        borderRadius: 8,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {leadingSlot}
      {modeSlot}
      {filterChips}

      <input
        ref={setInputNode}
        data-testid={`${testId}-input`}
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onCompositionStart={(e) => { composingRef.current = true; onCompositionStart?.(e); }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          onCompositionEnd?.(e);
          // Guaranteed commit: browsers don't always fire `change` after
          // compositionend, so re-send the final value with isComposing:false —
          // otherwise the controller/parser stays stuck deferring on ':'. If the
          // browser DOES fire a following change, the one-shot guard de-dupes it.
          postCompositionCommitRef.current = e.target.value;
          emit(e.target.value, false);
        }}
        aria-label={ariaLabel}
        aria-invalid={invalid ? 'true' : undefined}
        aria-busy={busy ? 'true' : undefined}
        aria-describedby={ariaDescribedBy}
        role={role}
        aria-autocomplete={ariaAutoComplete}
        aria-expanded={role ? (ariaExpanded ? 'true' : 'false') : undefined}
        aria-controls={controlsId}
        aria-activedescendant={activeDescendantId || undefined}
        style={{
          flex: 1, minWidth: 0,
          border: 'none', background: 'transparent',
          color: 'var(--text-primary)', fontSize: 12.5,
        }}
      />

      {busy && (
        <span
          data-testid={`${testId}-busy`}
          aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--text-tertiary)', display: 'inline-flex' }}
        >
          <Icon name="hourglass" size={13} />
        </span>
      )}

      {/* The count is not decorative: the visual number is aria-hidden, but a
          screen-reader-only aria-live region announces the localized label, so
          the count is never shown silently. Rendered only WITH that label. */}
      {showCount && (
        <span
          data-testid={`${testId}-count`}
          style={{ flexShrink: 0, display: 'inline-flex' }}
        >
          <span
            aria-hidden="true"
            style={{ color: 'var(--text-tertiary)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}
          >{resultCount}</span>
          <span data-testid={`${testId}-count-live`} role="status" aria-live="polite" style={SR_ONLY}>
            {resultCountLabel}
          </span>
        </span>
      )}

      {showClear && (
        <button
          type="button"
          data-testid={`${testId}-clear`}
          aria-label={clearAriaLabel}
          onClick={handleClear}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
            color: 'var(--text-tertiary)', borderRadius: 4,
          }}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}
