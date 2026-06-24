/**
 * K1 — mount smoke test для CanvasSkeleton.
 *
 * Render root + verify presence Header + Tree + Canvas + view toggle.
 * Editor НЕ открыт по умолчанию.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CanvasSkeleton from '../index';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

afterEach(cleanup);

describe('K1 — CanvasSkeleton mount', () => {
  it('renders root container', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('canvas-skeleton')).toBeTruthy();
  });

  it('breadcrumb ON (дефолт): шапка без дубль-«← Назад» и без имени проекта; 🔪-тоггл остаётся', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-header')).toBeTruthy();
    // Крошки «📁 {проект} › Сборки» покрывают навигацию + имя → дубль убран.
    expect(screen.queryByTestId('skeleton-back-btn')).toBeNull();
    expect(screen.queryByTestId('skeleton-header-title')).toBeNull();
    // Рестрикционный тоггл — отдельная функция, остаётся.
    expect(screen.getByTestId('skeleton-restriction-header-toggle')).toBeTruthy();
    // Layout/Graph toggle retired (M-WORKSPACE).
    expect(screen.queryByTestId('skeleton-view-toggle')).toBeNull();
  });

  it('rollback: FEATURE_FLAGS.breadcrumb=false возвращает «← Назад» + имя проекта в шапке', () => {
    const prev = FEATURE_FLAGS.breadcrumb;
    FEATURE_FLAGS.breadcrumb = false;
    try {
      render(<CanvasSkeleton />);
      expect(screen.getByTestId('skeleton-back-btn')).toBeTruthy();
      expect(screen.getByTestId('skeleton-header-title')).toBeTruthy();
    } finally {
      FEATURE_FLAGS.breadcrumb = prev;
    }
  });

  it('PC-K1: LibraryTreeHost no longer mounted (replaced by top search bar — PC-K2)', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-library-tree-host')).toBeNull();
    expect(screen.queryByTestId('library-tree-root')).toBeNull();
  });

  it('renders the two-level assembly-tab workspace in the canvas area (M-WORKSPACE)', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-canvas-area')).toBeTruthy();
    expect(screen.getByTestId('project-assembly-workspace')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-canvas-layout')).toBeNull();
  });

  it('editor closed by default', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-editor')).toBeNull();
  });
});
