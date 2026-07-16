/**
 * K1.2 — SearchResultsListbox: the SOLE owner of role="listbox"/role="option",
 * the option id, aria-selected, and mouse selection. renderOption returns only
 * non-interactive content. loading / empty / diagnostic / result-count live in
 * a separate role="status" aria-live region OUTSIDE the options list; aria-busy
 * marks the results area. Mouse: left mousedown only prevents focus loss,
 * selection fires on click exactly once, the right button never selects.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchResultsListbox from '../SearchResultsListbox';
import { optionDomId } from '../searchUiContract';

afterEach(cleanup);

const ITEMS = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];
const renderOption = (item) => <span data-testid={`opt-body-${item.id}`}>{item.label}</span>;

const base = (over = {}) => (
  <SearchResultsListbox
    id="lb1"
    items={ITEMS}
    activeIndex={-1}
    onSelect={() => {}}
    renderOption={renderOption}
    {...over}
  />
);

describe('SearchResultsListbox — roles, ids, selection state', () => {
  it('renders a role=listbox with one role=option per item', () => {
    render(base());
    const list = screen.getByTestId('search-listbox');
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('id')).toBe('lb1');
    expect(list.querySelectorAll('[role="option"]').length).toBe(3);
  });

  it('stamps the shared option id formula (by STABLE key) and marks aria-selected on the active index', () => {
    render(base({ activeIndex: 1 }));
    const opts = screen.getAllByRole('option');
    expect(opts[0].getAttribute('id')).toBe(optionDomId('lb1', 'a'));
    expect(opts[1].getAttribute('id')).toBe(optionDomId('lb1', 'b'));
    expect(opts[1].getAttribute('aria-selected')).toBe('true');
    expect(opts[0].getAttribute('aria-selected')).toBe('false');
    expect(opts[2].getAttribute('aria-selected')).toBe('false');
  });

  it('the option id stays with its entity through a reorder (key-based, not positional)', () => {
    const { rerender } = render(base());
    const idBefore = screen.getAllByRole('option')[0].getAttribute('id'); // 'a' at index 0
    rerender(<SearchResultsListbox id="lb1" items={[ITEMS[2], ITEMS[0], ITEMS[1]]} activeIndex={-1} onSelect={() => {}} renderOption={renderOption} />);
    const aNow = screen.getAllByRole('option')[1]; // 'a' (Alpha) now at index 1
    expect(aNow.textContent).toBe('Alpha');
    expect(aNow.getAttribute('id')).toBe(idBefore); // same id — followed the entity
  });

  it('renderOption receives { active, index } and its content is non-interactive', () => {
    const spy = vi.fn((item) => <span data-testid={`b-${item.id}`}>{item.label}</span>);
    render(base({ renderOption: spy, activeIndex: 0 }));
    expect(spy).toHaveBeenCalledWith(ITEMS[0], { active: true, index: 0 });
    expect(spy).toHaveBeenCalledWith(ITEMS[1], { active: false, index: 1 });
    // no nested interactive elements inside any option
    const list = screen.getByTestId('search-listbox');
    expect(list.querySelectorAll('button, a, input, [role="option"] [role="option"]').length).toBe(0);
  });
});

describe('SearchResultsListbox — mouse contract', () => {
  it('left mousedown prevents default (keeps focus on the input) but does NOT select', () => {
    const onSelect = vi.fn();
    render(base({ onSelect }));
    const opt = screen.getAllByRole('option')[0];
    const notPrevented = fireEvent.mouseDown(opt); // false ⇔ preventDefault was called
    expect(notPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects on click exactly once with (item, index)', () => {
    const onSelect = vi.fn();
    render(base({ onSelect }));
    fireEvent.click(screen.getAllByRole('option')[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[2], 2);
  });

  it('the right button never selects', () => {
    const onSelect = vi.fn();
    render(base({ onSelect }));
    fireEvent.contextMenu(screen.getAllByRole('option')[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disabled: a click does NOT select (defense in depth even if a popup leaks through)', () => {
    const onSelect = vi.fn();
    render(base({ onSelect, disabled: true }));
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fail-closed: throws if two options collapse to the same key (ambiguous identity)', () => {
    expect(() => render(base({ items: [{ id: 'x' }, { id: 'x' }] }))).toThrow();
  });
});

describe('SearchResultsListbox — states (status region outside the options list)', () => {
  it('rows + loading: aria-busy on the results area, rows still present', () => {
    render(base({ loading: true }));
    expect(screen.getByTestId('search-listbox-results').getAttribute('aria-busy')).toBe('true');
    expect(screen.getAllByRole('option').length).toBe(3);
  });

  // K3.2 — this component no longer ranks loading / diagnostic / empty against each other. It
  // renders the ONE `statusContent` the caller chose, in the ONE live region. The precedence it
  // used to own (e.g. «a diagnostic supersedes empty») now lives in the pure projection
  // `lib/search-session-presentation`, tested there — one owner, one place to get it wrong.
  it('whatever the state, the caller-chosen statusContent is announced in the ONE live region', () => {
    render(base({ statusContent: <span data-testid="cnt">3 результата</span> }));
    const status = screen.getByTestId('search-listbox-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.querySelector('[data-testid="cnt"]')).toBeTruthy();
  });

  it('statusContent is never an option, and never enters the <ul>', () => {
    render(base({ statusContent: <span data-testid="diag">проверка не выполнена</span> }));
    expect(screen.getByTestId('search-listbox').querySelector('[data-testid="diag"]')).toBeNull();
    expect(screen.getAllByRole('option').length).toBe(3); // rows are untouched by the status
    expect(screen.queryAllByRole('option').map((o) => o.textContent).join()).not.toMatch(/проверка/);
  });

  it('status without rows renders zero options and still announces', () => {
    render(base({ items: [], statusContent: <span data-testid="blk">запрос заблокирован</span> }));
    expect(screen.getByTestId('blk')).toBeTruthy();
    expect(screen.queryAllByRole('option').length).toBe(0);
  });

  it('no statusContent → the live region stays empty (nothing is invented here)', () => {
    render(base({ items: [] }));
    expect(screen.getByTestId('search-listbox-status').textContent).toBe('');
  });

  it('exactly ONE live region exists in the result area — no nesting, no duplicate announcer', () => {
    render(base({ loading: true, statusContent: <span>идёт проверка</span> }));
    const area = screen.getByTestId('search-listbox-results');
    expect(area.querySelectorAll('[aria-live]').length).toBe(1);
    expect(area.querySelectorAll('[role="status"]').length).toBe(1);
    expect(area.querySelectorAll('[role="alert"]').length).toBe(0);
  });
});
