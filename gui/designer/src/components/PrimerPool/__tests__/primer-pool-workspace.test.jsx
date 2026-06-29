/**
 * PrimerPoolWorkspace + 'primer-pool' route — PRIMER-2b («Праймеры вынести под
 * библиотеку в левой панели»). Pins: the route is registered, the workspace
 * shell renders (header «Праймеры» + the pool list), and «Назад» returns to the
 * library workspace.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../store';
import PrimerPoolWorkspace from '../PrimerPoolWorkspace';

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState({ primersById: {}, _primersHydrated: true, libraryEntries: {} });
});
afterEach(cleanup);

describe('primer-pool route', () => {
  it('setActiveWorkspace(\'primer-pool\') is a registered route', () => {
    useStore.getState().setActiveWorkspace('primer-pool');
    expect(useStore.getState().workspace.active).toBe('primer-pool');
  });
});

describe('PrimerPoolWorkspace', () => {
  it('renders the shell with «Праймеры» header and the pool list', () => {
    render(<PrimerPoolWorkspace />);
    expect(screen.getByTestId('primer-pool-workspace')).toBeTruthy();
    expect(screen.getByTestId('primer-pool-workspace').textContent).toContain('Праймеры');
    expect(screen.getByTestId('primer-pool-list')).toBeTruthy();
    expect(screen.getByTestId('primer-pool-status-filter')).toBeTruthy();
  });

  it('«Назад» returns to the library workspace', () => {
    const goBack = vi.fn();
    const setActiveWorkspace = vi.fn();
    useStore.setState({ goBack, setActiveWorkspace });
    render(<PrimerPoolWorkspace />);
    fireEvent.click(screen.getByTestId('primer-pool-back'));
    expect(setActiveWorkspace).toHaveBeenCalledWith('library');
  });
});
