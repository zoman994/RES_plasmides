/**
 * SearchFilterChips — K1.5. Renders ONLY removable filter chips (e.g. a tag
 * filter or a type filter). Each chip carries its own localized labels via
 * props — this component hardcodes no user strings. `disabled` blocks removal.
 *
 * Out of scope by design: fixed-domain scope labels (DNA / primer / enzyme)
 * belong to the mode slot, not here (a fixed domain is not a removable filter);
 * and "remove all" / clear-vs-clear-text lives in K2. So every chip here is
 * removable — there is no removable:false path to abuse.
 *
 * UI-only: React + the project Icon + design tokens.
 */
import React from 'react';
import { Icon } from '../icons/Icon';
import { hasText } from './searchUiContract';

export default function SearchFilterChips({
  chips = [],
  onRemove,
  disabled = false,
  testId = 'search-chips',
}) {
  if (!chips || chips.length === 0) return null;

  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={`search-chip-${chip.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 4px 1px 7px', borderRadius: 9, fontSize: 10.5,
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span>{chip.label}</span>
          {/* Fail-closed a11y: the remove control renders only with a NON-BLANK
              localized name — never an unnamed (or whitespace-named) button. */}
          {hasText(chip.removeLabel) && (
            <button
              type="button"
              data-testid={`search-chip-remove-${chip.id}`}
              aria-label={chip.removeLabel}
              disabled={disabled}
              onClick={() => { if (!disabled) onRemove?.(chip.id); }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', padding: 1, borderRadius: 4,
                cursor: disabled ? 'default' : 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
