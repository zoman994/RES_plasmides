import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import UnderConstruction from '../UnderConstruction';
import DagPlaceholder from '../DagPlaceholder';
import SettingsModal from '../SettingsModal';

function reset() {
  useStore.setState((state) => {
    state.theme = 'light';
    state.modals = { settings: false };
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.toast = null;
  });
}

describe('K6 — UnderConstruction + DagPlaceholder + SettingsModal', () => {
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

  it('DagPlaceholder renders the empty-canvas placeholder text', () => {
    render(<DagPlaceholder />);
    const node = screen.getByTestId('dag-placeholder');
    expect(node.textContent).toContain('Empty project');
  });

  it('SettingsModal Display tab toggles theme + applies data-theme on root', () => {
    render(<SettingsModal />);
    fireEvent.click(screen.getByTestId('settings-toggle-dark'));
    expect(useStore.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
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
