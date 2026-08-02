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

  // P3 — cross-mount sequence-navigation channel.
  it('requestSequenceNav parks a normalized nav request; clearSequenceNav acks it', () => {
    useStore.getState().requestSequenceNav('e1', {
      segments: [{ start: 3, end: 9 }], strand: '-', revision: 'rev7', caret: { start: 3, end: 9 },
    });
    const nav = useStore.getState().navRequest;
    expect(nav).toMatchObject({ entryId: 'e1', strand: -1, revision: 'rev7', kind: 'sequence', status: 'pending' });
    expect(nav.segments).toEqual([{ start: 3, end: 9 }]);
    useStore.getState().clearSequenceNav();
    expect(useStore.getState().navRequest).toBeNull();
  });

  it('the nav channel carries every physical fact of the locus (U5-A)', () => {
    // `strand` is the ±1 the SELECTION needs and therefore cannot express `both`; `segments` can hold
    // two ranges but a caret cannot. The consumer needs the canonical facts to hand the occurrence
    // to the overlay unflattened, so they travel too instead of being re-derived downstream.
    useStore.getState().requestSequenceNav('e1', {
      segments: [{ start: 14, end: 20 }, { start: 0, end: 6 }],
      caret: { start: 14, end: 20 },
      strand: 1, strandRaw: 'both', wrapsOrigin: true, identityBps: 10000,
    });
    const nav = useStore.getState().navRequest;
    expect(nav.segments).toEqual([{ start: 14, end: 20 }, { start: 0, end: 6 }]);
    expect(nav.strandRaw).toBe('both');
    expect(nav.wrapsOrigin).toBe(true);
    expect(nav.identityBps).toBe(10000);
  });

  it('a junk identityBps is REFUSED, not repaired into a colour', () => {
    for (const bad of [10001, -1, 1.5, '9500', NaN, null, undefined, Infinity]) {
      useStore.getState().requestSequenceNav('e1', { segments: [{ start: 0, end: 4 }], identityBps: bad });
      expect(useStore.getState().navRequest.identityBps, String(bad)).toBeNull();
    }
    // …and an absent strandRaw falls back to the selection strand, never to a bare «+».
    useStore.getState().requestSequenceNav('e1', { segments: [{ start: 0, end: 4 }], strand: '-' });
    expect(useStore.getState().navRequest.strandRaw).toBe('-');
  });

  it('requestSequenceNav with no entry/target clears the channel', () => {
    useStore.getState().requestSequenceNav('e1', { segments: [{ start: 0, end: 4 }] });
    useStore.getState().requestSequenceNav(null, null);
    expect(useStore.getState().navRequest).toBeNull();
  });
});
