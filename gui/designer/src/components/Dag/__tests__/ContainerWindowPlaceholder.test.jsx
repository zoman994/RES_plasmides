/**
 * ContainerWindowPlaceholder — Sprint M-C.1 K4 (DEC-MC1-05).
 *
 * Drill-in placeholder rendered when biolog double-clicks a
 * PlasmidNode. Shows ← Назад button (popFullscreen) + container name
 * (lookup `libraryEntries[containerId]`) + central «M-C.2 — В
 * разработке» message. Real fullscreen lands in M-C.2.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import ContainerWindowPlaceholder from '../ContainerWindowPlaceholder';

function reset() {
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.canvas.activeFullscreen = 'start';
    s.canvas.navStack = [{ fullscreen: 'start', payload: null }];
  });
}

beforeEach(reset);
afterEach(() => cleanup());

describe('M-C.1 K4 — ContainerWindowPlaceholder', () => {
  it('renders the container name when libraryEntries has the id', () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-1'] = {
        id: 'lib-1', name: 'pUC19', kind: 'container',
        payload: { sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [] },
        ext: {},
      };
    });
    render(<ContainerWindowPlaceholder containerId="lib-1" />);
    expect(screen.getByTestId('container-window-placeholder-name').textContent).toContain('pUC19');
  });

  it('renders a fallback name when the entry is missing', () => {
    render(<ContainerWindowPlaceholder containerId="ghost" />);
    expect(screen.getByTestId('container-window-placeholder')).toBeTruthy();
    expect(screen.getByTestId('container-window-placeholder-name').textContent).not.toBe('');
  });

  it('renders the «В разработке» drill-in message', () => {
    render(<ContainerWindowPlaceholder containerId="lib-1" />);
    expect(screen.getByTestId('container-window-placeholder-msg').textContent).toMatch(/M-C\.2|разработке/i);
  });

  it('← Назад button calls popFullscreen', () => {
    useStore.setState((s) => {
      s.canvas.activeFullscreen = 'containerWindow';
      s.canvas.navStack = [
        { fullscreen: 'dag', payload: { projectId: 'p1' } },
        { fullscreen: 'containerWindow', payload: { containerId: 'lib-1' } },
      ];
    });
    render(<ContainerWindowPlaceholder containerId="lib-1" />);
    fireEvent.click(screen.getByTestId('container-window-placeholder-back'));
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });
});
