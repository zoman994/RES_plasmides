import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useStore } from '../../store';
import { clearAllAutosaveTimers, setAutosaveDelay, DEFAULT_AUTOSAVE_DELAY_MS } from '../../store/projectSlice';
import App from '../../App';

function reset() {
  clearAllAutosaveTimers();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state.fileHandle = null;
    state.fileName = null;
    state.lastSavedToFileAt = null;
    state.fileLastKnownModified = null;
    state.recoveredFromCrash = false;
    state.saveStatus = 'idle';
    state.fileExternallyModified = false;
    state.handlePermissionStatus = null;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toast = null;
    state.theme = 'light';
  });
}

describe('K4 — App + AppShell + Topbar routing', () => {
  beforeEach(() => {
    reset();
    cleanup();
  });

  it('renders StartScreen when activeFullscreen=start (no AppShell)', () => {
    render(<App />);
    expect(screen.getByTestId('start-screen')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('renders AppShell + DagPlaceholder when activeFullscreen=dag', () => {
    useStore.setState((state) => {
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: null }];
    });
    render(<App />);
    expect(screen.getByTestId('app-shell')).toBeTruthy();
    expect(screen.getByTestId('dag-placeholder')).toBeTruthy();
  });

  it('renders AppShell + UnderConstruction when activeFullscreen=underConstruction', () => {
    useStore.setState((state) => {
      state.canvas.activeFullscreen = 'underConstruction';
      state.canvas.navStack = [
        { fullscreen: 'start', payload: null },
        { fullscreen: 'underConstruction', payload: { milestone: 'M-H', name: 'Library' } },
      ];
    });
    render(<App />);
    expect(screen.getByTestId('app-shell')).toBeTruthy();
    const node = screen.getByTestId('under-construction');
    expect(node.textContent).toContain('Library');
    expect(node.textContent).toContain('M-H');
  });

  it('Topbar shows project name and dirty dot for unsaved project', () => {
    const id = useStore.getState().createProject('My plasmid');
    expect(id).toBeDefined();
    render(<App />);
    expect(screen.getByTestId('topbar')).toBeTruthy();
    expect(screen.getByText('My plasmid')).toBeTruthy();
    expect(screen.getByTestId('topbar-dirty-dot')).toBeTruthy();
  });

  it('Topbar Back button calls popFullscreen → activeFullscreen pops', () => {
    useStore.setState((state) => {
      state.canvas.activeFullscreen = 'underConstruction';
      state.canvas.navStack = [
        { fullscreen: 'start', payload: null },
        { fullscreen: 'underConstruction', payload: { milestone: 'M-H', name: 'Library' } },
      ];
    });
    render(<App />);
    const back = screen.getByTestId('topbar-back');
    fireEvent.click(back);
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
  });
});
