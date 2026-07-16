/**
 * K2.1 — SearchModeSelector: the §9.2 grouped mode dropdown. UI-only, driven by
 * pre-gated, label-resolved `groups` props. A trigger button opens a role=listbox
 * with group headers (role=presentation, not options) and role=option modes;
 * keyboard + active-descendant reuse the K1 headless-nav contract; selection
 * closes and returns focus to the trigger. Fail-closed on duplicate mode ids.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchModeSelector from '../SearchModeSelector';
import { optionDomId } from '../searchUiContract';

afterEach(cleanup);

const GROUPS = [
  { id: 'userData', label: 'Пользовательские данные', modes: [{ id: 'lib', label: 'Библиотека' }, { id: 'mol', label: 'Молекулы' }] },
  { id: 'bio', label: 'Биопоиск', modes: [{ id: 'seq', label: 'ДНК' }, { id: 'aa', label: 'Белок' }] },
];
const TRIGGER = 'search-mode-trigger';

const sel = (over = {}) => (
  <SearchModeSelector
    groups={GROUPS}
    selectedModeId="lib"
    onSelectMode={() => {}}
    triggerLabel="Библиотека"
    ariaLabel="Режим поиска"
    listboxId="modelb"
    {...over}
  />
);

describe('SearchModeSelector — trigger', () => {
  it('is a single, coherent select-only combobox: role=combobox on the focused trigger', () => {
    render(sel());
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.textContent).toMatch(/Библиотека/);
    // ONE pattern: the trigger IS the combobox (focus + aria-activedescendant live here);
    // it is not a plain button carrying an activedescendant it has no role for.
    expect(trig.getAttribute('role')).toBe('combobox');
    expect(trig.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(trig.getAttribute('aria-label')).toBe('Режим поиска');
  });

  it('aria-activedescendant belongs to the element with role=combobox (W3C select-only)', () => {
    render(sel());
    const trig = screen.getByTestId(TRIGGER);
    trig.focus();
    fireEvent.keyDown(trig, { key: 'ArrowDown' }); // open + active first
    expect(trig.getAttribute('role')).toBe('combobox');
    expect(trig.getAttribute('aria-activedescendant')).toBe(optionDomId('modelb', 'lib'));
    expect(document.activeElement).toBe(trig); // focus stays on the combobox, not moved into the popup
  });

  it('opens on click and closes on a second click', () => {
    render(sel());
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    expect(trig.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(trig);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('SearchModeSelector — grouped options', () => {
  it('renders group headers (not options) and one role=option per mode, active mode aria-selected', () => {
    render(sel());
    fireEvent.click(screen.getByTestId(TRIGGER));
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(4); // lib, mol, seq, aa — headers are NOT options
    const lib = document.getElementById(optionDomId('modelb', 'lib'));
    expect(lib.getAttribute('aria-selected')).toBe('true'); // selectedModeId=lib
    // group labels present but not counted as options
    expect(screen.getByText('Биопоиск')).toBeTruthy();
  });
});

describe('SearchModeSelector — selection', () => {
  it('Enter on the active option selects it, closes, and returns focus to the trigger', () => {
    const onSelectMode = vi.fn();
    render(sel({ onSelectMode }));
    const trig = screen.getByTestId(TRIGGER);
    trig.focus();
    fireEvent.keyDown(trig, { key: 'ArrowDown' }); // open + active first (lib)
    expect(trig.getAttribute('aria-activedescendant')).toBe(optionDomId('modelb', 'lib'));
    fireEvent.keyDown(trig, { key: 'Enter' });
    expect(onSelectMode).toHaveBeenCalledWith('lib');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trig);
  });

  it('clicking a mode option selects it and closes', () => {
    const onSelectMode = vi.fn();
    render(sel({ onSelectMode }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(document.getElementById(optionDomId('modelb', 'aa')));
    expect(onSelectMode).toHaveBeenCalledWith('aa');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Escape closes without selecting', () => {
    const onSelectMode = vi.fn();
    render(sel({ onSelectMode }));
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.keyDown(trig, { key: 'ArrowDown' });
    fireEvent.keyDown(trig, { key: 'Escape' });
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(onSelectMode).not.toHaveBeenCalled();
  });
});

describe('SearchModeSelector — disabled + fail-closed', () => {
  it('disabled: trigger is disabled and does not open', () => {
    render(sel({ disabled: true }));
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.disabled).toBe(true);
    fireEvent.keyDown(trig, { key: 'ArrowDown' });
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('throws if two modes across groups collapse to the same id (ambiguous identity)', () => {
    const dup = [
      { id: 'g1', label: 'G1', modes: [{ id: 'x', label: 'X' }] },
      { id: 'g2', label: 'G2', modes: [{ id: 'x', label: 'X2' }] },
    ];
    expect(() => {
      render(sel({ groups: dup }));
      fireEvent.click(screen.getByTestId(TRIGGER)); // options render on open
    }).toThrow();
  });
});
