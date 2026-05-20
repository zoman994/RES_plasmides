/**
 * PC-K4 — SkeletonHeader shows project.name.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import CanvasSkeleton from '../index';
import { useStore } from '../../../store';
import { bootstrapStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(cleanup);

describe('PC-K4 — header title binding', () => {
  it('shows project.name when a project is current', async () => {
    const id = useStore.getState().createProject('My pks4 study');
    render(<CanvasSkeleton />);
    const title = screen.getByTestId('skeleton-header-title');
    expect(title.textContent).toBe('My pks4 study');
    // Cleanup: drop project.
    act(() => { useStore.setState((st) => { delete st.projects[id]; st.currentProjectId = null; }); });
  });

  it('falls back to default when no project is active', () => {
    render(<CanvasSkeleton />);
    const title = screen.getByTestId('skeleton-header-title');
    // STRINGS default OR ultimate fallback.
    expect(title.textContent).toMatch(/Canvas|Без названия/);
  });
});
