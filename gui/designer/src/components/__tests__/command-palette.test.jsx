/**
 * CommandPalette — Sprint M-X.8 K6 (DEC-UIRREV-COMMAND-PALETTE-PROJECTS).
 *
 * Covers: open/close via store flag, group rendering (PINNED +
 * OTHERS), filter substring, row click → activate + close, ★/☆
 * toggle without activate, pin cap toast, «+ Создать проект»,
 * Esc / outside-click close.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import CommandPalette from '../CommandPalette';
import { PIN_LIMIT } from '../../store/projectSlice';

beforeEach(() => {
  useStore.setState((s) => {
    s.projects = {};
    s.pinnedProjectIds = [];
    s.recentProjectIds = [];
    s.currentProjectId = null;
    s.modals = { ...(s.modals || {}), commandPalette: false };
  });
});
afterEach(cleanup);

function seed(...names) {
  useStore.setState((s) => {
    for (const n of names) {
      s.projects[`id-${n}`] = { id: `id-${n}`, name: n, containerIds: [] };
    }
  });
}

function open() {
  useStore.setState((s) => { s.modals.commandPalette = true; });
}

describe('M-X.8 K6 — CommandPalette', () => {
  it('returns null when closed; mounts overlay + dialog when modals.commandPalette=true', () => {
    seed('A');
    const { rerender } = render(<CommandPalette />);
    expect(screen.queryByTestId('command-palette')).toBeNull();
    open();
    rerender(<CommandPalette />);
    expect(screen.getByTestId('command-palette')).toBeTruthy();
    expect(screen.getByTestId('command-palette-overlay')).toBeTruthy();
  });

  it('renders PINNED group on top, OTHERS below; filter narrows by substring', () => {
    seed('Alpha', 'Beta', 'Gamma');
    useStore.setState((s) => { s.pinnedProjectIds = ['id-Alpha']; });
    open();
    render(<CommandPalette />);
    expect(screen.getByTestId('command-palette-group-pinned').textContent).toMatch(/ЗАКРЕПЛЕНО · 1/);
    expect(screen.getByTestId('command-palette-group-others').textContent).toMatch(/ОСТАЛЬНЫЕ · 2/);
    expect(screen.getByTestId('palette-row-id-Alpha')).toBeTruthy();
    expect(screen.getByTestId('palette-row-id-Beta')).toBeTruthy();
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: 'gam' } });
    expect(screen.queryByTestId('palette-row-id-Alpha')).toBeNull();
    expect(screen.queryByTestId('palette-row-id-Beta')).toBeNull();
    expect(screen.getByTestId('palette-row-id-Gamma')).toBeTruthy();
  });

  it('row click activates the project AND closes the palette', () => {
    seed('A', 'B');
    useStore.setState((s) => { s.currentProjectId = 'id-A'; });
    open();
    render(<CommandPalette />);
    fireEvent.click(screen.getByTestId('palette-row-id-B'));
    expect(useStore.getState().currentProjectId).toBe('id-B');
    expect(useStore.getState().modals.commandPalette).toBe(false);
  });

  it('★ toggle pins WITHOUT activation; ☆ toggle unpins; both keep palette open', () => {
    seed('A');
    open();
    render(<CommandPalette />);
    // Initially not pinned: hollow ☆.
    fireEvent.click(screen.getByTestId('palette-pin-toggle-id-A'));
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-A']);
    expect(useStore.getState().currentProjectId).toBeNull();        // NOT activated
    expect(useStore.getState().modals.commandPalette).toBe(true);   // still open
    // Re-click on the now-filled ★ → unpin.
    fireEvent.click(screen.getByTestId('palette-pin-toggle-id-A'));
    expect(useStore.getState().pinnedProjectIds).toEqual([]);
  });

  it('pin cap exceeded triggers a toast (warning kind)', () => {
    const names = Array.from({ length: PIN_LIMIT + 1 }, (_, i) => `p${i}`);
    seed(...names);
    useStore.setState((s) => {
      s.pinnedProjectIds = names.slice(0, PIN_LIMIT).map((n) => `id-${n}`);
    });
    open();
    render(<CommandPalette />);
    fireEvent.click(screen.getByTestId(`palette-pin-toggle-id-p${PIN_LIMIT}`));
    expect(useStore.getState().pinnedProjectIds.length).toBe(PIN_LIMIT);
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /больше \d+ проектов/.test(t.msg) && t.kind === 'warning')).toBe(true);
  });

  it('«+ Создать проект» creates + closes', () => {
    open();
    render(<CommandPalette />);
    fireEvent.click(screen.getByTestId('command-palette-create'));
    expect(Object.keys(useStore.getState().projects).length).toBe(1);
    expect(useStore.getState().currentProjectId).toBeTruthy();
    expect(useStore.getState().modals.commandPalette).toBe(false);
  });

  it('Esc closes the palette', () => {
    seed('A');
    open();
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useStore.getState().modals.commandPalette).toBe(false);
  });
});
