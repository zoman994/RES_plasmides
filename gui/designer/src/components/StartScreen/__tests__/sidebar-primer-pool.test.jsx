/**
 * Sidebar «Праймеры» nav item — PRIMER-2b (Игорь: «Праймеры вынести под
 * библиотеку в левой панели»). Pins: the item exists, sits directly AFTER
 * «Библиотека» (and before «Выравнивание»), click routes to the primer-pool
 * workspace, and only it lights up when active.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../store';
import Sidebar from '../Sidebar';

const noop = () => {};

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((s) => {
    s.workspace = { active: 'library', history: [], context: {} };
    s.canvas = { ...(s.canvas || {}), activeFullscreen: 'library' };
    s.currentProjectId = null;
    s.projects = {};
    s.pinnedProjectIds = [];
  });
});
afterEach(cleanup);

function renderSidebar() {
  return render(<Sidebar collapsed={false} onToggle={noop} onOpenHotkeys={noop} />);
}

describe('Sidebar — «Праймеры» под «Библиотекой»', () => {
  it('пункт «Праймеры» существует и стоит сразу под «Библиотекой» (перед «Выравнивание»)', () => {
    renderSidebar();
    const primers = screen.getByTestId('ss-nav-primer-pool');
    expect(primers.textContent).toContain('Праймеры');
    // DOM order: library → primer-pool → align
    const lib = screen.getByTestId('ss-nav-library');
    const align = screen.getByTestId('ss-nav-align');
    expect(lib.compareDocumentPosition(primers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primers.compareDocumentPosition(align) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('клик «Праймеры» переключает workspace на primer-pool', () => {
    renderSidebar();
    fireEvent.click(screen.getByTestId('ss-nav-primer-pool'));
    expect(useStore.getState().workspace.active).toBe('primer-pool');
  });

  it('когда активен primer-pool — подсвечен только «Праймеры», не «Библиотека»', () => {
    useStore.setState((s) => { s.workspace = { active: 'primer-pool', history: [], context: {} }; });
    renderSidebar();
    expect(screen.getByTestId('ss-nav-primer-pool').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('ss-nav-library').getAttribute('data-active')).toBe('false');
  });
});
