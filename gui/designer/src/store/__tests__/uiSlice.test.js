import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../index';
import { THEME_STORAGE_KEY, AGENT_STORAGE_KEY } from '../uiSlice';
import { _setFallbackForTests, _resetMemoryStore, getItem, getJSON } from '../../lib/storage';

function reset() {
  useStore.setState((state) => {
    state.theme = 'light';
    state.agent = { name: '', email: '' };
    state.modals = { settings: false, projectInfo: false };
    state.toasts = [];
  });
}

describe('K2 — uiSlice', () => {
  beforeEach(() => {
    _setFallbackForTests(true);
    _resetMemoryStore();
    reset();
  });

  afterEach(() => {
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('setTheme persists to localStorage and applies data-theme on root', () => {
    useStore.getState().setTheme('dark');
    expect(useStore.getState().theme).toBe('dark');
    expect(getItem(THEME_STORAGE_KEY)).toContain('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme rejects invalid value', () => {
    useStore.getState().setTheme('purple');
    expect(useStore.getState().theme).toBe('light');
  });

  it('setAgent persists name and email', () => {
    useStore.getState().setAgent({ name: 'Alice', email: 'alice@lab' });
    expect(useStore.getState().agent).toEqual({ name: 'Alice', email: 'alice@lab' });
    expect(getJSON(AGENT_STORAGE_KEY, null)).toEqual({ name: 'Alice', email: 'alice@lab' });
  });

  it('openSettings / closeSettings toggle modal flag', () => {
    useStore.getState().openSettings();
    expect(useStore.getState().modals.settings).toBe(true);
    useStore.getState().closeSettings();
    expect(useStore.getState().modals.settings).toBe(false);
  });

  // Звено 2 (25.05.2026): showToast forwards options.actionLabel onto the
  // toast entry (button text), null when absent.
  it('showToast stores options.actionLabel on the toast entry (null when absent)', () => {
    useStore.getState().showToast('with label', 'success', { actionLabel: 'Продолжить аннотацию' });
    useStore.getState().showToast('no label', 'info');
    const { toasts } = useStore.getState();
    expect(toasts[0].actionLabel).toBe('Продолжить аннотацию');
    expect(toasts[1].actionLabel).toBe(null);
  });
});
