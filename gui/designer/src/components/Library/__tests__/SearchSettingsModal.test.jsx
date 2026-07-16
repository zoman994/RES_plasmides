/**
 * SearchSettingsModal — the GLOBAL «Настройки поиска» window (P2). Opens on the
 * `bodgegene:open-search-settings` event (fired by the bar's «изменить» link).
 * Every item is explained (what + why); Save persists via search-prefs; Reset
 * restores defaults (persisted on Save). The smart box needs none of this — these
 * are the buried advanced knobs.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import SearchSettingsModal from '../SearchSettingsModal';
import { loadSearchPrefs, DEFAULT_SEARCH_PREFS } from '../../../lib/search-prefs';

const openIt = () => act(() => { window.dispatchEvent(new CustomEvent('bodgegene:open-search-settings')); });

beforeEach(() => { try { localStorage.clear(); } catch { /* no-op */ } });
afterEach(cleanup);

describe('SearchSettingsModal', () => {
  it('is closed until the open event fires', () => {
    render(<SearchSettingsModal />);
    expect(screen.queryByTestId('search-settings-modal')).toBeNull();
    openIt();
    expect(screen.getByTestId('search-settings-modal')).toBeTruthy();
  });

  it('renders each advanced item WITH an explanation', () => {
    render(<SearchSettingsModal />);
    openIt();
    for (const key of ['identityThreshold', 'bothStrands', 'iupac', 'circular', 'limit']) {
      expect(screen.getByTestId(`search-setting-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`search-setting-${key}-help`).textContent.length).toBeGreaterThan(10);
    }
  });

  it('editing + Save persists via search-prefs', () => {
    render(<SearchSettingsModal />);
    openIt();
    const both = screen.getByTestId('search-setting-bothStrands');
    fireEvent.click(both); // default true → false
    fireEvent.click(screen.getByTestId('search-settings-save'));
    expect(loadSearchPrefs().bothStrands).toBe(false);
    expect(screen.queryByTestId('search-settings-modal')).toBeNull(); // closes on save
  });

  it('Reset restores the default values in the form', () => {
    render(<SearchSettingsModal />);
    openIt();
    const both = screen.getByTestId('search-setting-bothStrands');
    fireEvent.click(both); // to false
    expect(both.checked).toBe(false);
    fireEvent.click(screen.getByTestId('search-settings-reset'));
    expect(screen.getByTestId('search-setting-bothStrands').checked).toBe(DEFAULT_SEARCH_PREFS.bothStrands);
  });

  it('Escape closes without persisting', () => {
    render(<SearchSettingsModal />);
    openIt();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('search-settings-modal')).toBeNull();
  });
});
