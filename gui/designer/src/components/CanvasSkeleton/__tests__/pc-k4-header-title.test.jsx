/**
 * PC-K4 — SkeletonHeader shows project.name.
 *
 * Имя проекта в шапке — это ROLLBACK-путь: при `FEATURE_FLAGS.breadcrumb=true`
 * (дефолт) дубль-имя убрано (его показывают крошки), поэтому привязку проверяем
 * с флагом OFF, где `skeleton-header-title` ещё рендерится.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import CanvasSkeleton from '../index';
import { useStore } from '../../../store';
import { bootstrapStore } from '../../../store';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

let prevBreadcrumb;
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  prevBreadcrumb = FEATURE_FLAGS.breadcrumb;
  FEATURE_FLAGS.breadcrumb = false; // rollback header — имя проекта в шапке
});
afterEach(() => { FEATURE_FLAGS.breadcrumb = prevBreadcrumb; cleanup(); });

describe('PC-K4 — header title binding (rollback header, breadcrumb OFF)', () => {
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
