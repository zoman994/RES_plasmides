/**
 * LibraryTopBar — кнопка «Открыть проект» (UX чистка, Игорь 19.06).
 *
 * «Нафига она, если можно тыкнуть по проекту/сборке в левой панели». Когда
 * двухуровневый рельс активен (FEATURE_FLAGS.twoLevelRail, дефолт), сайдбар
 * всегда показывает активный проект + его сборки, и клик по сборке/«Создать
 * сборку» открывает тот же канвас (pushFullscreen canvasSkeleton). Поэтому
 * кнопка в топбаре — дубль и убрана. Откат — флаг twoLevelRail=false (рельса
 * без проектной секции → кнопка нужна).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

beforeEach(() => {
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = { p1: { id: 'p1', name: 'Проект-1' } };
    s.currentProjectId = 'p1';
  });
});
afterEach(cleanup);

describe('LibraryTopBar — «Открыть проект» (дубль с рельсом)', () => {
  it('twoLevelRail ON (дефолт): кнопка «Открыть проект» убрана', () => {
    renderTopBar({});
    expect(screen.queryByTestId('library-topbar-open-project')).toBeNull();
  });

  it('rollback: twoLevelRail=false → «Открыть проект» есть и открывает канвас', () => {
    const prev = FEATURE_FLAGS.twoLevelRail;
    FEATURE_FLAGS.twoLevelRail = false;
    const spy = vi.fn();
    useStore.setState((s) => { s.pushFullscreen = spy; });
    try {
      renderTopBar({});
      const btn = screen.getByTestId('library-topbar-open-project');
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(spy).toHaveBeenCalledWith({ fullscreen: 'canvasSkeleton', payload: null });
    } finally {
      FEATURE_FLAGS.twoLevelRail = prev;
    }
  });
});
