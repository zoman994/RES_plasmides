import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../store';
import { PENDING_NEW_ASSEMBLY } from '../../../store/projectAssembliesSlice';
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

describe('Sidebar — двухуровневый рельс (фаза 2)', () => {
  it('группа «Инструменты» с заголовком над навигацией', () => {
    renderSidebar();
    expect(screen.getByTestId('sb-tools-header').textContent).toBe('Инструменты');
    expect(screen.getByTestId('ss-nav-home')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-library')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-align')).toBeTruthy();
  });

  it('без активного проекта — нет группы «Проект» и пункта «Сборки»', () => {
    renderSidebar();
    expect(screen.queryByTestId('sb-project-header')).toBeNull();
    expect(screen.queryByTestId('ss-nav-project-assemblies')).toBeNull();
  });

  it('с активным проектом — заголовок «Проект · {имя}» + пункт «Сборки»', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'pPICZ_CBHI', containerIds: [] } };
      s.currentProjectId = 'p1';
    });
    renderSidebar();
    expect(screen.getByTestId('sb-project-header').textContent).toContain('pPICZ_CBHI');
    expect(screen.getByTestId('ss-nav-project-assemblies')).toBeTruthy();
  });

  it('клик «Сборки» открывает канвас проекта (pushFullscreen canvasSkeleton + projectId)', () => {
    const push = vi.fn();
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'pPICZ_CBHI', containerIds: [] } };
      s.currentProjectId = 'p1';
      s.pushFullscreen = push;
    });
    renderSidebar();
    fireEvent.click(screen.getByTestId('ss-nav-project-assemblies'));
    expect(push).toHaveBeenCalledWith({ fullscreen: 'canvasSkeleton', payload: { projectId: 'p1' } });
  });

  it('пункт «Создать сборку» активен, когда открыт канвас (activeFullscreen=canvasSkeleton)', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'X', containerIds: [] } };
      s.currentProjectId = 'p1';
      s.canvas = { ...(s.canvas || {}), activeFullscreen: 'canvasSkeleton' };
    });
    renderSidebar();
    expect(screen.getByTestId('ss-nav-project-assemblies').getAttribute('data-active')).toBe('true');
  });

  it('сборки РАСКРЫВАЮТСЯ списком из проекта (их может быть много) + «Новая сборка»', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'X', containerIds: [] } };
      s.currentProjectId = 'p1';
      s.activeProjectAssemblies = [{ id: 'z1', name: 'Сборка 1' }, { id: 'z2', name: 'Сборка 2' }];
      s.refreshActiveProjectAssemblies = () => {}; // no-op: не затирать seeded список
    });
    renderSidebar();
    expect(screen.getByTestId('ss-nav-assembly-z1').textContent).toContain('Сборка 1');
    expect(screen.getByTestId('ss-nav-assembly-z2').textContent).toContain('Сборка 2');
    expect(screen.getByTestId('ss-nav-assembly-new')).toBeTruthy();
    // пустой-state пункт не рендерится, когда есть сборки
    expect(screen.queryByTestId('ss-nav-project-assemblies')).toBeNull();
  });

  it('клик по сборке ставит pendingAssemblyId(id) и открывает канвас', () => {
    const push = vi.fn();
    const setPending = vi.fn();
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'X', containerIds: [] } };
      s.currentProjectId = 'p1';
      s.activeProjectAssemblies = [{ id: 'z1', name: 'Сборка 1' }, { id: 'z2', name: 'Сборка 2' }];
      s.refreshActiveProjectAssemblies = () => {};
      s.pushFullscreen = push;
      s.setPendingAssemblyId = setPending;
    });
    renderSidebar();
    fireEvent.click(screen.getByTestId('ss-nav-assembly-z2'));
    expect(setPending).toHaveBeenCalledWith('z2');
    expect(push).toHaveBeenCalledWith({ fullscreen: 'canvasSkeleton', payload: { projectId: 'p1' } });
  });

  it('«Новая сборка» ставит CREATE-сентинел (не просто открывает) + открывает канвас', () => {
    const push = vi.fn();
    const setPending = vi.fn();
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'X', containerIds: [] } };
      s.currentProjectId = 'p1';
      s.activeProjectAssemblies = [{ id: 'z1', name: 'Сборка 1' }];
      s.refreshActiveProjectAssemblies = () => {};
      s.pushFullscreen = push;
      s.setPendingAssemblyId = setPending;
    });
    renderSidebar();
    fireEvent.click(screen.getByTestId('ss-nav-assembly-new'));
    // the CREATE sentinel (not null / not an existing id) → SkeletonProvider creates a zone.
    expect(setPending).toHaveBeenCalledWith(PENDING_NEW_ASSEMBLY);
    expect(push).toHaveBeenCalledWith({ fullscreen: 'canvasSkeleton', payload: { projectId: 'p1' } });
  });

  it('секция «В работе» (закреплённые) убрана при twoLevelRail', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'X', containerIds: [] } };
      s.pinnedProjectIds = ['p1'];
      s.currentProjectId = 'p1';
    });
    renderSidebar();
    expect(screen.queryByTestId('sb-pinned-header')).toBeNull();
  });
});
