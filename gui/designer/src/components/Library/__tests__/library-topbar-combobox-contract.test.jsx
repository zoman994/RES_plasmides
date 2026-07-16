/**
 * Real-consumer contract for the mounted global-search combobox.
 *
 * K1 already proves the headless primitives in isolation. These tests prove
 * LibraryTopBar actually consumes that contract instead of rebuilding a weaker
 * listbox: stable ARIA ownership, keyboard selection, and the complete visual
 * metadata enum offered to biologists.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { setLang } from '../../../i18n';
import { renderTopBar } from './_topbar-harness';

const SEQ = 'AAATTTGCATGCATGCATGCATGCAAATTT';

function seedEntry(id, name) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id,
      name,
      projectId: null,
      kind: 'container',
      tags: [],
      payload: { sequence: SEQ, length: SEQ.length, topology: 'circular', annotations: [] },
    };
  });
}

beforeEach(() => {
  setLang('ru');
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.primersById = {};
    s.currentProjectId = null;
  });
});

afterEach(() => {
  setLang('ru');
  cleanup();
});

describe('LibraryTopBar — mounted K1 combobox contract', () => {
  it('owns stable option ids through aria-activedescendant and Enter picks the active entity', async () => {
    seedEntry('a', 'alpha-one');
    seedEntry('b', 'alpha-two');
    const onPick = vi.fn();
    renderTopBar({ query: 'alpha', onPickSearchResult: onPick });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    const input = screen.getByTestId('library-topbar-search-input');
    const options = screen.getAllByRole('option');
    expect(options.every((option) => option.id.length > 0)).toBe(true);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'entry', id: 'b' }),
      null,
    );
    // A real browser can deliver a focus event after the selection sink updates
    // the workspace and even after a zero-delay task. That focus must not
    // resurrect the just-closed popup.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.focus(input);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the popup when the navigation sink synchronously updates workspace state', async () => {
    seedEntry('a', 'alpha-one');
    const onPick = vi.fn(() => {
      useStore.setState((s) => {
        s.projects.p = { id: 'p', name: 'Alpha project' };
        s.currentProjectId = 'p';
      });
    });
    renderTopBar({ query: 'alpha', onPickSearchResult: onPick });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    const input = screen.getByTestId('library-topbar-search-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('offers molecule/primer types and both entry and primer lifecycle statuses', async () => {
    renderTopBar();

    fireEvent.click(screen.getByTestId('search-filter-trigger'));
    fireEvent.click(screen.getByTestId('search-filter-def-type'));
    expect(screen.getByText('Праймер')).toBeTruthy();
    expect(screen.getByText('Кольцевая')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.click(screen.getByTestId('search-filter-trigger'));
    fireEvent.click(screen.getByTestId('search-filter-def-status'));
    for (const label of [
      'Опубликован', 'В работе', 'Устаревший',
      'Импортирован', 'Спроектирован', 'Заказан', 'Получен', 'Архивный',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('hides the popup and forbids keyboard selection during IME composition', async () => {
    seedEntry('a', 'alpha-one');
    const onPick = vi.fn();
    renderTopBar({ query: 'alpha', onPickSearchResult: onPick });
    await waitFor(() => expect(screen.getByTestId('smart-result-a')).toBeTruthy());
    const input = screen.getByTestId('library-topbar-search-input');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'alphax' }, inputType: 'insertCompositionText', isComposing: true });
    await waitFor(() => expect(screen.queryByTestId('library-topbar-search-results')).toBeNull());
    const modeTrigger = screen.getByTestId('search-mode-trigger');
    expect(modeTrigger.disabled).toBe(true);
    fireEvent.click(modeTrigger);
    expect(screen.queryByTestId('search-mode-listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: 'alpha' } });
    await waitFor(() => expect(screen.getByTestId('library-topbar-search-results')).toBeTruthy());
  });

  it('renders new result and diagnostic strings from the active locale', async () => {
    setLang('en');
    seedEntry('a', 'alpha-one');
    renderTopBar({ query: 'alpha' });
    await waitFor(() => expect(screen.getByTestId('smart-result-a')).toBeTruthy());
    expect(screen.getByTestId('library-topbar-search-header').textContent).toContain('Search');
    expect(screen.getByTestId('search-prefs-open').textContent).toBe('Change');
  });

  it('shows the localized empty state after a normal metadata final with no matches', async () => {
    renderTopBar({ query: 'definitely-missing-entry' });
    await waitFor(() => expect(screen.getByText('Ничего не найдено.')).toBeTruthy());
    expect(screen.queryByTestId('search-provider-incomplete-warning')).toBeNull();
  });
});
