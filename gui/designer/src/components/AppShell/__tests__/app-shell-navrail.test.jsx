/**
 * AppShell + NavRail — Sprint M-X.7a v2 K5 integration tests.
 *
 * Asserts:
 *   1. AppShell renders Topbar + NavRail + content area
 *   2. NavRail click on workspace icon dispatches setActiveWorkspace
 *   3. Active state visual surfaces data-active=true on matching icon
 *   4. Stub icons (⌂, ⚗) are still clickable but exposed via
 *      data-stub=true for styling tests
 *   5. Children-overlay path: when AppShell receives children,
 *      WorkspaceRouter is bypassed
 *   6. Footer items rendered as disabled placeholders
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import AppShell from '../index';
import NavRail from '../NavRail';

// LibraryWorkspace + DagWorkspace + Importer are heavy lazy chunks.
// Stub them so the AppShell content router test focuses on routing
// + active-workspace switching, not on the full workspace render.
vi.mock('../../Library/LibraryWorkspace', () => ({
  default: () => <div data-testid="lazy-library-workspace">library</div>,
}));
vi.mock('../../Dag/DagWorkspace', () => ({
  default: () => <div data-testid="lazy-dag-workspace">dag</div>,
}));
vi.mock('../../Library', () => ({
  default: () => <div data-testid="lazy-importer">importer</div>,
}));
// Topbar pulls in heavy children too; stub for focus.
vi.mock('../Topbar', () => ({
  default: () => <header data-testid="topbar-stub">topbar</header>,
}));

async function freshDB() {
  const name = `bodgegene-shell-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.workspace = { active: 'library', history: [], context: {} };
  });
});
afterEach(cleanup);

describe('M-X.7a v2 K5 — AppShell composition', () => {
  it('mounts Topbar + NavRail + content area', () => {
    render(<AppShell />);
    expect(screen.getByTestId('app-shell')).toBeTruthy();
    expect(screen.getByTestId('topbar-stub')).toBeTruthy();
    expect(screen.getByTestId('nav-rail')).toBeTruthy();
    expect(screen.getByTestId('app-shell-content')).toBeTruthy();
  });

  it('default workspace.active="library" → LibraryWorkspace mounted via router', async () => {
    render(<AppShell />);
    await waitFor(() => {
      expect(screen.getByTestId('lazy-library-workspace')).toBeTruthy();
    });
  });

  it('children prop overrides WorkspaceRouter (overlay path for activeFullscreen modals)', () => {
    render(<AppShell><div data-testid="overlay-content">overlay</div></AppShell>);
    expect(screen.getByTestId('overlay-content')).toBeTruthy();
    expect(screen.queryByTestId('lazy-library-workspace')).toBeNull();
  });

  it('NavRail click on 🔀 switches workspace.active to flow → DagWorkspace mounts', async () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId('nav-rail-flow'));
    expect(useStore.getState().workspace.active).toBe('flow');
    await waitFor(() => {
      expect(screen.getByTestId('lazy-dag-workspace')).toBeTruthy();
    });
  });

  it('NavRail click on ⤓ switches workspace.active to importer (legacy access)', async () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId('nav-rail-importer'));
    expect(useStore.getState().workspace.active).toBe('importer');
    await waitFor(() => {
      expect(screen.getByTestId('lazy-importer')).toBeTruthy();
    });
  });
});

describe('M-X.7a v2 K5 — NavRail visual state', () => {
  it('active workspace icon surfaces data-active=true; others false', () => {
    useStore.setState((s) => { s.workspace.active = 'library'; });
    render(<NavRail />);
    expect(screen.getByTestId('nav-rail-library').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-rail-flow').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('nav-rail-startup').getAttribute('data-active')).toBe('false');
  });

  it('stub icons (⌂, ⚗) carry data-stub=true', () => {
    render(<NavRail />);
    expect(screen.getByTestId('nav-rail-startup').getAttribute('data-stub')).toBe('true');
    expect(screen.getByTestId('nav-rail-mix').getAttribute('data-stub')).toBe('true');
    expect(screen.getByTestId('nav-rail-library').getAttribute('data-stub')).toBe('false');
  });

  it('footer placeholders (⚙, ◐) render disabled', () => {
    render(<NavRail />);
    const settings = screen.getByTestId('nav-rail-footer-settings');
    const theme = screen.getByTestId('nav-rail-footer-theme');
    expect(settings.disabled).toBe(true);
    expect(theme.disabled).toBe(true);
  });

  it('clicking the same active workspace is a no-op (no history push)', () => {
    render(<NavRail />);
    fireEvent.click(screen.getByTestId('nav-rail-library'));
    expect(useStore.getState().workspace.history.length).toBe(0);
  });

  it('switching workspaces records history (so goBack works)', () => {
    render(<NavRail />);
    fireEvent.click(screen.getByTestId('nav-rail-flow'));
    fireEvent.click(screen.getByTestId('nav-rail-importer'));
    expect(useStore.getState().workspace.history).toEqual(['library', 'flow']);
  });
});
