/**
 * K1.4 — SearchCombobox: composes SearchField + useSearchComboboxNavigation +
 * SearchResultsListbox. Per the round-2 contract the combobox OWNS `open`
 * (uncontrolled): it opens on arrow/type and closes on blur/escape/select/Tab,
 * keeping focus on the input after a selection. role="combobox" on the input;
 * aria-activedescendant is present only while open and points at a real option
 * BY STABLE KEY (survives reorder); disabled forbids opening/navigation/
 * selection; a default listbox id is unique per instance (useId).
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchCombobox from '../SearchCombobox';
import { optionDomId } from '../searchUiContract';

afterEach(cleanup);

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const INPUT = 'search-field-input';

// Uncontrolled: the combobox owns `open`. The test only supplies data + callbacks.
const cb = (over = {}) => (
  <SearchCombobox
    value=""
    items={ITEMS}
    listboxId="lb1"
    sessionKey="sess"
    onSelect={() => {}}
    renderOption={(it) => <span data-testid={`row-${it.id}`}>{it.id}</span>}
    ariaLabel="Поиск"
    {...over}
  />
);

describe('SearchCombobox — combobox ARIA on the input', () => {
  it('the input is the combobox; aria-expanded reflects the OWNED open state', () => {
    render(cb());
    const input = screen.getByTestId(INPUT);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe('lb1');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // opens
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('aria-activedescendant appears only when open and points at a real option by KEY', () => {
    render(cb());
    const input = screen.getByTestId(INPUT);
    expect(input.getAttribute('aria-activedescendant')).toBeNull(); // closed
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // open + activate first
    const active = input.getAttribute('aria-activedescendant');
    expect(active).toBe(optionDomId('lb1', 'a'));
    expect(document.getElementById(active).getAttribute('role')).toBe('option');
  });

  it('a default listbox id is UNIQUE per instance (useId) — two comboboxes never collide', () => {
    render(<div>{cb({ listboxId: undefined })}{cb({ listboxId: undefined })}</div>);
    const [c1, c2] = screen.getAllByTestId(INPUT);
    const id1 = c1.getAttribute('aria-controls');
    const id2 = c2.getAttribute('aria-controls');
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});

describe('SearchCombobox — options', () => {
  it('renders exactly one option per item, no nested interactivity', () => {
    render(cb({ items: [{ id: 'only' }] }));
    fireEvent.keyDown(screen.getByTestId(INPUT), { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(options[0].querySelectorAll('button, a, input, [role="option"]').length).toBe(0);
  });

  it('the popup (listbox) is not rendered while closed', () => {
    render(cb());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('SearchCombobox — active identity across result churn', () => {
  it('a reorder keeps the active entity — activedescendant is KEY-based, so it does not move', () => {
    const { rerender } = render(cb({ items: ITEMS }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active 'a'
    expect(input.getAttribute('aria-activedescendant')).toBe(optionDomId('lb1', 'a'));
    rerender(cb({ items: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] }));
    // key-based id → same descendant, and it resolves to 'a' (now index 1)
    expect(input.getAttribute('aria-activedescendant')).toBe(optionDomId('lb1', 'a'));
    expect(document.getElementById(optionDomId('lb1', 'a')).textContent).toBe('a');
  });

  it('removing the active entity clears aria-activedescendant (no dangling)', () => {
    const { rerender } = render(cb({ items: ITEMS }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active 'a'
    rerender(cb({ items: [{ id: 'b' }, { id: 'c' }] }));
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('a new query (sessionKey change) drops the active option', () => {
    const { rerender } = render(cb({ items: ITEMS, sessionKey: 'q1' }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active 'a' in q1
    expect(input.getAttribute('aria-activedescendant')).toBe(optionDomId('lb1', 'a'));
    rerender(cb({ items: ITEMS, sessionKey: 'q2' }));
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('a text-only surface (no sessionKey, textOnly) uses value as the session boundary', () => {
    const { rerender } = render(cb({ sessionKey: undefined, textOnly: true, value: '' }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active 'a'
    expect(input.getAttribute('aria-activedescendant')).toBe(optionDomId('lb1', 'a'));
    rerender(cb({ sessionKey: undefined, textOnly: true, value: 'pU' })); // text changed → new session
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('fail-closed: a general combobox without sessionKey and not textOnly throws (session must be identified)', () => {
    expect(() => render(
      <SearchCombobox
        value="" items={ITEMS} listboxId="lb1" onSelect={() => {}}
        renderOption={(it) => <span>{it.id}</span>} ariaLabel="a"
      />,
    )).toThrow();
  });
});

describe('SearchCombobox — open notification tracks EFFECTIVE open', () => {
  it('notifies onOpenChange(true) when the popup opens', () => {
    const onOpenChange = vi.fn();
    render(cb({ onOpenChange }));
    fireEvent.keyDown(screen.getByTestId(INPUT), { key: 'ArrowDown' });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('notifies onOpenChange(false) when disabling closes the popup (observer never stuck at open=true)', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(cb({ onOpenChange }));
    fireEvent.keyDown(screen.getByTestId(INPUT), { key: 'ArrowDown' }); // open → true
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    rerender(cb({ onOpenChange, disabled: true })); // disable closes → must notify false
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('SearchCombobox — selection + lifecycle', () => {
  it('Enter on the active option selects it and closes the popup', () => {
    const onSelect = vi.fn();
    render(cb({ onSelect }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // active 'a', open
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0], 0);
    expect(screen.queryByRole('listbox')).toBeNull(); // closed after selection
  });

  it('clicking an option selects once and returns focus to the input', () => {
    const onSelect = vi.fn();
    render(cb({ onSelect }));
    const input = screen.getByTestId(INPUT);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // open
    fireEvent.click(screen.getByTestId('row-b').closest('[role="option"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1], 1);
    expect(document.activeElement).toBe(input); // focus returns to the input
  });

  it('typing opens the popup and forwards value + composition metadata', () => {
    const onValueChange = vi.fn();
    render(cb({ onValueChange }));
    const input = screen.getByTestId(INPUT);
    fireEvent.change(input, { target: { value: 'pU' } });
    expect(onValueChange).toHaveBeenCalledWith('pU', { isComposing: false });
    expect(screen.getByRole('listbox')).toBeTruthy(); // opened on type
  });

  it('blur closes the popup (click-away) and forwards onBlur', () => {
    const onBlur = vi.fn();
    render(cb({ onBlur }));
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // open
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onBlur).toHaveBeenCalled();
  });
});

describe('SearchCombobox — disabled', () => {
  it('does not open, navigate or select while disabled', () => {
    const onSelect = vi.fn();
    render(cb({ disabled: true, onSelect }));
    const input = screen.getByTestId(INPUT);
    expect(input.disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('open→disabled hides the popup AND does not resurrect it on re-enable (openState reset)', () => {
    const { rerender } = render(cb());
    fireEvent.keyDown(screen.getByTestId(INPUT), { key: 'ArrowDown' }); // open
    expect(screen.getByRole('listbox')).toBeTruthy();
    rerender(cb({ disabled: true }));
    expect(screen.queryByRole('listbox')).toBeNull();
    rerender(cb({ disabled: false }));
    expect(screen.queryByRole('listbox')).toBeNull(); // stays closed — no lingering openState
  });
});
