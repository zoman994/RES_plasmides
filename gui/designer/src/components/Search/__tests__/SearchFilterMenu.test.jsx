/**
 * K2.2 — SearchFilterMenu: the `+ Фильтр` menu (§9.3). A menu-button opens a
 * role=menu of filter types with roving focus (Arrow/Home/End, focus the first
 * item on open); a text filter opens a role=dialog popover (NOT an input inside
 * role=menu); an enum filter offers its options; a PROJECT filter is an entity
 * picker that commits a STABLE {projectId,label}. Full lifecycle: open→disabled
 * closes and blocks pick/commit, re-enable does not resurrect a stage, IME
 * Enter/Escape do not commit/close mid-composition, and focus returns to the
 * trigger after close/Escape/select. Fail-closed on blank labels / values.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchFilterMenu from '../SearchFilterMenu';

afterEach(cleanup);

const DEFS = [
  { id: 'name', label: 'Название', inputType: 'text' },
  { id: 'tag', label: 'Тег', inputType: 'text' },
  { id: 'type', label: 'Тип', inputType: 'enum', enumKey: 'type' },
  { id: 'project', label: 'Проект', inputType: 'entity', entityKind: 'project' },
];
const ENUM_OPTIONS = { type: [{ value: 'circular', label: 'Кольцевая' }, { value: 'linear', label: 'Линейная' }] };
const ENTITY_OPTIONS = { project: [{ projectId: 'p1', label: 'Alpha' }, { projectId: 'p2', label: 'Alpha' }] };
const TRIGGER = 'search-filter-trigger';

const menu = (over = {}) => (
  <SearchFilterMenu
    filterDefs={DEFS}
    enumOptions={ENUM_OPTIONS}
    entityOptions={ENTITY_OPTIONS}
    onAddFilter={() => {}}
    triggerLabel="+ Фильтр"
    ariaLabel="Добавить фильтр"
    {...over}
  />
);

describe('SearchFilterMenu — type menu + roving focus', () => {
  it('opens a role=menu of filter types and moves focus onto the first menuitem', () => {
    render(menu());
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(trig);
    expect(trig.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-name')); // focus moved in
  });

  it('Arrow/Home/End move focus among menuitems', () => {
    render(menu());
    const m = screen.getByTestId(TRIGGER);
    fireEvent.click(m);
    const list = screen.getByRole('menu');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-tag'));
    fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-project'));
    fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-name'));
  });

  it('fail-closed: a def without a label, and a blank trigger name, render nothing', () => {
    render(menu({ filterDefs: [...DEFS, { id: 'blank', label: '  ', inputType: 'text' }] }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    expect(screen.queryByTestId('search-filter-def-blank')).toBeNull();
    cleanup();
    const { container } = render(menu({ triggerLabel: '  ', ariaLabel: '  ' }));
    expect(container.querySelector(`[data-testid="${TRIGGER}"]`)).toBeNull(); // no unnamed trigger
  });
});

describe('SearchFilterMenu — text filter (dialog popover)', () => {
  it('picks a text filter into a role=dialog, commits on Enter, closes and refocuses the trigger', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    expect(screen.getByRole('dialog')).toBeTruthy(); // NOT role=menu for a text input
    expect(screen.queryByRole('menu')).toBeNull();
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'pBG' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'pBG');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trig); // focus returns to trigger
  });

  it('fail-closed: an empty / whitespace text value is not added', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddFilter).not.toHaveBeenCalled();
  });

  it('IME: Enter and Escape mid-composition neither commit nor close', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'име' } });
    fireEvent.keyDown(input, { key: 'Enter' }); // mid-IME → no commit
    expect(onAddFilter).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' }); // mid-IME → no close
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' }); // now commits
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'име');
  });
});

describe('SearchFilterMenu — enum filter', () => {
  it('offers enum options and commits the chosen value', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-type'));
    fireEvent.click(screen.getByTestId('search-filter-enum-linear'));
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[2], 'linear');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('fail-closed: enum options with a blank label or blank value are skipped', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter, enumOptions: { type: [{ value: 'ok', label: 'OK' }, { value: '  ', label: 'blankval' }, { value: 'x', label: '  ' }] } }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-type'));
    expect(screen.getByTestId('search-filter-enum-ok')).toBeTruthy();
    expect(screen.queryByTestId('search-filter-enum-x')).toBeNull(); // blank label
    expect(screen.queryByTestId('search-filter-enum-  ')).toBeNull(); // blank value
  });
});

describe('SearchFilterMenu — project ENTITY picker (stable identity)', () => {
  it('commits a stable {projectId,label}, not a typed name — even for two same-named projects', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-project'));
    // two projects both labelled "Alpha" — the SECOND must commit its own id
    fireEvent.click(screen.getByTestId('search-filter-entity-p2'));
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[3], { projectId: 'p2', label: 'Alpha' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('fail-closed: entity options without a label or without a projectId are skipped', () => {
    render(menu({ entityOptions: { project: [{ projectId: 'ok', label: 'Good' }, { projectId: '', label: 'noid' }, { projectId: 'q', label: '  ' }] } }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-project'));
    expect(screen.getByTestId('search-filter-entity-ok')).toBeTruthy();
    expect(screen.queryByTestId('search-filter-entity-q')).toBeNull(); // blank label
  });
});

describe('SearchFilterMenu — disabled lifecycle', () => {
  it('open → disabled closes immediately and blocks commit; re-enable does not resurrect the stage', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name')); // text stage
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(menu({ onAddFilter, disabled: true }));
    expect(screen.queryByRole('dialog')).toBeNull(); // closed on disable
    rerender(menu({ onAddFilter, disabled: false }));
    expect(screen.queryByRole('dialog')).toBeNull(); // no stage resurrection
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disabled trigger does not open', () => {
    render(menu({ disabled: true }));
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.disabled).toBe(true);
    fireEvent.click(trig);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the type menu and returns focus to the trigger', () => {
    render(menu());
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trig);
  });
});

describe('SearchFilterMenu — pairwise state intersections (frozen A/D counterexamples)', () => {
  it('D1: the IME flag does not survive a close — composition → disable → re-enable → Enter commits', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    fireEvent.compositionStart(screen.getByTestId('search-filter-value-input')); // composing = true
    rerender(menu({ onAddFilter, disabled: true })); // disable must clear the composing flag
    rerender(menu({ onAddFilter, disabled: false })); // re-enable
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'pBG' } });
    fireEvent.keyDown(input, { key: 'Enter' }); // must commit — no stuck IME state
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'pBG');
  });

  it('D2: a real triggerLabel with a blank ariaLabel still gives the menu an accessible name', () => {
    render(menu({ ariaLabel: '  ' })); // whitespace ariaLabel; triggerLabel "+ Фильтр"
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.getAttribute('aria-label')).toBe('+ Фильтр');
    fireEvent.click(trig);
    expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('+ Фильтр');
  });

  it('D3: a def with an unknown inputType is not offered (never opens a stage that vanishes)', () => {
    render(menu({ filterDefs: [{ id: 'weird', label: 'Weird', inputType: 'slider' }, ...DEFS] }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    expect(screen.queryByTestId('search-filter-def-weird')).toBeNull();
  });

  it('D3: an enum def with no valid options is not offered, and if NO def is actionable the menu will not open', () => {
    render(menu({ filterDefs: [{ id: 'type', label: 'Тип', inputType: 'enum', enumKey: 'type' }], enumOptions: { type: [{ value: '  ', label: '  ' }] } }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    expect(screen.queryByRole('menu')).toBeNull(); // nothing actionable → no empty menu
    expect(screen.queryByTestId('search-filter-def-type')).toBeNull();
  });

  it('D4: an already-open enum stage whose options DRAIN closes the menu and refocuses the trigger (not stuck empty)', () => {
    const { rerender } = render(menu());
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    fireEvent.click(screen.getByTestId('search-filter-def-type')); // enum stage open
    expect(screen.getByTestId('search-filter-enum-circular')).toBeTruthy();
    rerender(menu({ enumOptions: { type: [] } })); // options drained AFTER open
    expect(screen.queryByRole('menu')).toBeNull(); // never a keyboard-stuck empty menu
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trig); // keyboard still works
  });

  it('D4: an open type-list that DRAINS to empty (filterDefs→[]) closes and refocuses the trigger', () => {
    const { rerender } = render(menu());
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig); // type list open
    expect(screen.getByRole('menu')).toBeTruthy();
    rerender(menu({ filterDefs: [] }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trig);
  });

  it('D4: roving tabIndex stays valid when the item count shrinks (clamped active index)', () => {
    const many = [
      { id: 'name', label: 'Название', inputType: 'text' },
      { id: 'tag', label: 'Тег', inputType: 'text' },
      { id: 'project', label: 'Проект', inputType: 'entity', entityKind: 'project' },
    ];
    const { rerender } = render(menu({ filterDefs: many }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' }); // menuIndex → last
    rerender(menu({ filterDefs: [{ id: 'name', label: 'Название', inputType: 'text' }] }));
    const only = screen.getByTestId('search-filter-def-name');
    expect(only.getAttribute('tabindex')).toBe('0'); // the surviving item is the roving-focus target
  });

  it('D4: a blur that abandons composition (no compositionEnd) does not leave Enter stuck', () => {
    const onAddFilter = vi.fn();
    render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.compositionStart(input);
    fireEvent.blur(input); // window switch mid-IME, no compositionEnd
    fireEvent.change(input, { target: { value: 'pBG' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'pBG'); // not swallowed by a stuck IME flag
  });
});

describe('SearchFilterMenu — K2-corr3 (data changes UNDER an open stage)', () => {
  it('corr3-1: the ACTIVE def is removed from filterDefs → menu closes, no callback with a stale def', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    fireEvent.click(screen.getByTestId('search-filter-def-name')); // text stage open
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'pBG' } });
    // parent removes the 'name' def while its stage is open
    rerender(menu({ onAddFilter, filterDefs: DEFS.filter((d) => d.id !== 'name') }));
    expect(screen.queryByRole('dialog')).toBeNull(); // stage gone, not lingering
    expect(screen.queryByRole('menu')).toBeNull(); // full close, not a fallback type-list
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trig); // keyboard control returned
    expect(onAddFilter).not.toHaveBeenCalled(); // never committed the removed filter
  });

  it('corr3-1: an ACTIVE enum whose def drops out of the actionable set closes the menu', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    const trig = screen.getByTestId(TRIGGER);
    fireEvent.click(trig);
    fireEvent.click(screen.getByTestId('search-filter-def-type')); // enum stage open
    expect(screen.getByTestId('search-filter-enum-linear')).toBeTruthy();
    // the enum def is removed from filterDefs entirely
    rerender(menu({ onAddFilter, filterDefs: DEFS.filter((d) => d.id !== 'type') }));
    expect(screen.queryByTestId('search-filter-enum-linear')).toBeNull();
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    expect(onAddFilter).not.toHaveBeenCalled();
  });

  it('corr3-2: roving focus follows the ELEMENT KEY across a reorder — focus and tabIndex=0 stay on one item, arrows work', () => {
    const three = [
      { id: 'a', label: 'AA', inputType: 'text' },
      { id: 'b', label: 'BB', inputType: 'text' },
      { id: 'c', label: 'CC', inputType: 'text' },
    ];
    const { rerender } = render(menu({ filterDefs: three }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    const list = screen.getByRole('menu');
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // focus moves onto 'b'
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-b'));
    // reorder: 'b' moves to the front (same length, effective index would differ)
    rerender(menu({ filterDefs: [three[1], three[2], three[0]] }));
    const bBtn = screen.getByTestId('search-filter-def-b');
    expect(document.activeElement).toBe(bBtn); // DOM focus followed the item, not the index
    expect(bBtn.getAttribute('tabindex')).toBe('0'); // and it is the roving target
    // arrows still operate relative to the focused item
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('search-filter-def-c'));
  });

  it('corr3-1b: removing the active def MID-IME clears the composing flag — after restore+reopen, Enter commits', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name')); // text stage
    fireEvent.compositionStart(screen.getByTestId('search-filter-value-input')); // composing = true
    // the active def is removed WHILE composing → activeDefLost drain must clear IME too
    rerender(menu({ onAddFilter, filterDefs: DEFS.filter((d) => d.id !== 'name') }));
    // restore the def and reopen the same text filter
    rerender(menu({ onAddFilter, filterDefs: DEFS }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'pBG' } });
    fireEvent.keyDown(input, { key: 'Enter' }); // must commit — composing cleared on the drain
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'pBG');
  });

  it('corr3-3: losing the accessible name drains the session — a restored label does NOT resurrect the old stage/text', () => {
    const { rerender } = render(menu());
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name')); // text stage
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'секрет' } });
    fireEvent.compositionStart(input); // mid-IME too
    // both labels vanish → component renders nothing
    rerender(menu({ triggerLabel: '  ', ariaLabel: '  ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // label returns
    rerender(menu({ triggerLabel: '+ Фильтр', ariaLabel: 'Добавить фильтр' }));
    const trig = screen.getByTestId(TRIGGER);
    expect(trig.getAttribute('aria-expanded')).toBe('false'); // no resurrection
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    // reopening the same text filter starts from an EMPTY input
    fireEvent.click(trig);
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    expect(screen.getByTestId('search-filter-value-input').value).toBe('');
  });

  it('corr3-3: after the name is restored, the IME flag is clear — Enter commits immediately', () => {
    const onAddFilter = vi.fn();
    const { rerender } = render(menu({ onAddFilter }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    fireEvent.compositionStart(screen.getByTestId('search-filter-value-input')); // composing = true
    rerender(menu({ onAddFilter, triggerLabel: '  ', ariaLabel: '  ' })); // name lost → drain must clear IME
    rerender(menu({ onAddFilter, triggerLabel: '+ Фильтр', ariaLabel: 'Добавить фильтр' }));
    fireEvent.click(screen.getByTestId(TRIGGER));
    fireEvent.click(screen.getByTestId('search-filter-def-name'));
    const input = screen.getByTestId('search-filter-value-input');
    fireEvent.change(input, { target: { value: 'pBG' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddFilter).toHaveBeenCalledWith(DEFS[0], 'pBG'); // not swallowed by a stuck IME flag
  });
});
