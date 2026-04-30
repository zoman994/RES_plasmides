import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useStore } from '../store';
import { clearAllAutosaveTimers, clearAllLocks, setAutosaveDelay, DEFAULT_AUTOSAVE_DELAY_MS } from '../store/projectSlice';
import { clearAll } from '../db/dexie-schema';
import { _setPlatformOverrideForTests, _clearHandlersForTests } from '../lib/hotkeys';
import App from '../App';

async function reset() {
  clearAllAutosaveTimers();
  clearAllLocks();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  _clearHandlersForTests();
  _setPlatformOverrideForTests('other');
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state.fileHandle = null;
    state.fileName = null;
    state.lastSavedToFileAt = null;
    state.fileLastKnownModified = null;
    state.recoveredFromCrash = false;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false };
    state.toast = null;
    state.theme = 'light';
  });
}

function pressHotkey(combo) {
  const ev = new KeyboardEvent('keydown', {
    key: combo.key,
    ctrlKey: combo.ctrl || false,
    metaKey: combo.meta || false,
    altKey: combo.alt || false,
    shiftKey: combo.shift || false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
  return ev;
}

async function flushAsync() {
  // let the resolver's promise chain settle
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

describe('K4-fixup — hotkey scenario F (round-trip via registry)', () => {
  beforeEach(reset);
  afterEach(() => {
    cleanup();
    _clearHandlersForTests();
    _setPlatformOverrideForTests(null);
  });

  it('Cmd/Ctrl+N from start → DAG (creates Untitled project)', async () => {
    render(<App />);
    await act(async () => {
      pressHotkey({ key: 'n', ctrl: true });
      await flushAsync();
    });
    expect(useStore.getState().currentProjectId).not.toBeNull();
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('Cmd/Ctrl+, opens Settings modal; Esc closes it', async () => {
    render(<App />);
    await act(async () => {
      pressHotkey({ key: ',', ctrl: true });
      await flushAsync();
    });
    expect(useStore.getState().modals.settings).toBe(true);
    await act(async () => {
      pressHotkey({ key: 'Escape' });
      await flushAsync();
    });
    expect(useStore.getState().modals.settings).toBe(false);
  });

  it('Cmd/Ctrl+W closes the project (only when one is open)', async () => {
    render(<App />);
    // first verify Cmd+W on start has no effect (no project)
    await act(async () => {
      pressHotkey({ key: 'w', ctrl: true });
      await flushAsync();
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');

    // now create a project, then Cmd+W
    await act(async () => {
      pressHotkey({ key: 'n', ctrl: true });
      await flushAsync();
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    await act(async () => {
      pressHotkey({ key: 'w', ctrl: true });
      await flushAsync();
    });
    expect(useStore.getState().currentProjectId).toBeNull();
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
  });

  it('Cmd/Ctrl+S without project = no-op (scope global-with-project gates it)', async () => {
    render(<App />);
    await act(async () => {
      pressHotkey({ key: 's', ctrl: true });
      await flushAsync();
    });
    // no toast / no save attempt because currentProjectId is null
    expect(useStore.getState().toast).toBeNull();
    expect(useStore.getState().lastSavedToFileAt).toBeNull();
  });

  it('Esc from underConstruction pops back to start', async () => {
    useStore.setState((state) => {
      state.canvas.activeFullscreen = 'underConstruction';
      state.canvas.navStack = [
        { fullscreen: 'start', payload: null },
        { fullscreen: 'underConstruction', payload: { milestone: 'M-H', name: 'Library' } },
      ];
    });
    render(<App />);
    await act(async () => {
      pressHotkey({ key: 'Escape' });
      await flushAsync();
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
  });

  it('Esc on root start (no modal, navStack=1) is a no-op', async () => {
    render(<App />);
    await act(async () => {
      pressHotkey({ key: 'Escape' });
      await flushAsync();
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
    expect(useStore.getState().modals.settings).toBe(false);
  });
});
