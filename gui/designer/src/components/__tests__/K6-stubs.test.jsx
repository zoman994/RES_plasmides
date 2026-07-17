import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import UnderConstruction from '../UnderConstruction';
import SettingsModal from '../SettingsModal';

function reset() {
  useStore.setState((state) => {
    state.theme = 'light';
    state.modals = { settings: false, projectInfo: false };
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.toasts = [];
  });
}

describe('K6 — UnderConstruction + SettingsModal', () => {
  beforeEach(() => { reset(); cleanup(); });

  it('UnderConstruction renders milestone + name from prop payload', () => {
    render(<UnderConstruction payload={{ milestone: 'M-F', name: 'Primer pool' }} />);
    const node = screen.getByTestId('under-construction');
    expect(node.textContent).toContain('Primer pool');
    expect(node.textContent).toContain('M-F');
  });

  it('UnderConstruction falls back to navStack top payload when prop missing', () => {
    useStore.setState((state) => {
      state.canvas.activeFullscreen = 'underConstruction';
      state.canvas.navStack = [
        { fullscreen: 'start', payload: null },
        { fullscreen: 'underConstruction', payload: { milestone: 'M-H', name: 'Library' } },
      ];
    });
    render(<UnderConstruction />);
    const node = screen.getByTestId('under-construction');
    expect(node.textContent).toContain('Library');
    expect(node.textContent).toContain('M-H');
  });

  // UX-006 — Display tab restored 2026-05-06 to host theme + sequence
  // wrap + polymerase + primer prefix + annotate-on-import default.
  // (The earlier «no longer has Display tab» assertion came from an
  // intermediate state where preferences had been moved to localStorage
  // without a UI surface — see legacy comment in DECISIONS.md.)
  it('SettingsModal defaults to Identity on open', () => {
    render(<SettingsModal />);
    expect(screen.getByTestId('settings-tab-content-identity')).toBeTruthy();
  });

  it('SettingsModal: Identity, Display, Advanced tabs all reachable', () => {
    render(<SettingsModal />);
    expect(screen.getByTestId('settings-tab-identity')).toBeTruthy();
    expect(screen.getByTestId('settings-tab-display')).toBeTruthy();
    expect(screen.getByTestId('settings-tab-advanced')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-tab-advanced'));
    expect(screen.getByTestId('settings-tab-content-advanced')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-tab-display'));
    expect(screen.getByTestId('settings-tab-content-display')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-tab-identity'));
    expect(screen.getByTestId('settings-tab-content-identity')).toBeTruthy();
  });

  it('SettingsModal Identity tab saves agent', () => {
    render(<SettingsModal />);
    fireEvent.click(screen.getByTestId('settings-tab-identity'));
    fireEvent.change(screen.getByTestId('settings-name'), { target: { value: 'Игорь' } });
    fireEvent.change(screen.getByTestId('settings-email'), { target: { value: 'i@lab' } });
    fireEvent.click(screen.getByTestId('settings-save-identity'));
    expect(useStore.getState().agent).toEqual({ name: 'Игорь', email: 'i@lab' });
  });

  it('SettingsModal Advanced Reset shows confirm step (no immediate destruction)', () => {
    render(<SettingsModal />);
    fireEvent.click(screen.getByTestId('settings-tab-advanced'));
    expect(screen.getByTestId('settings-reset')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-reset'));
    expect(screen.getByTestId('settings-reset-confirm')).toBeTruthy();
  });
});
