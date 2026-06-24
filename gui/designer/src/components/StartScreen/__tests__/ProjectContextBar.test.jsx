import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../store';
import ProjectContextBar from '../ProjectContextBar';

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((s) => {
    s.currentProjectId = null;
    s.projects = {};
    s.recentProjectIds = [];
    s.fileName = null;
  });
});
afterEach(cleanup);

function seedProjects() {
  useStore.setState((s) => {
    s.projects = {
      ...s.projects,
      p1: { id: 'p1', name: 'pPICZ_CBHI', containerIds: ['c1', 'c2'] },
      p2: { id: 'p2', name: 'glaA_lib', containerIds: [] },
    };
    s.recentProjectIds = ['p1', 'p2'];
    s.currentProjectId = 'p1';
    s.fileName = 'pPICZ.bodge';
  });
}

describe('ProjectContextBar — фаза 1: видимость активного проекта', () => {
  it('показывает «Проект не выбран», когда активного проекта нет', () => {
    render(<ProjectContextBar />);
    expect(screen.getByTestId('pcb-empty')).toBeTruthy();
    expect(screen.queryByTestId('pcb-name')).toBeNull();
  });

  it('показывает имя активного проекта и файл', () => {
    seedProjects();
    render(<ProjectContextBar />);
    expect(screen.getByTestId('pcb-name').textContent).toBe('pPICZ_CBHI');
    expect(screen.getByTestId('pcb-file').textContent).toBe('pPICZ.bodge');
  });

  it('без файла показывает «только в браузере»', () => {
    seedProjects();
    useStore.setState((s) => { s.fileName = null; });
    render(<ProjectContextBar />);
    expect(screen.getByTestId('pcb-nofile')).toBeTruthy();
    expect(screen.queryByTestId('pcb-file')).toBeNull();
  });

  it('клик «Сменить» открывает дропдаун с недавними проектами', () => {
    seedProjects();
    render(<ProjectContextBar />);
    expect(screen.queryByTestId('pcb-dropdown')).toBeNull();
    fireEvent.click(screen.getByTestId('pcb-switch'));
    expect(screen.getByTestId('pcb-dropdown')).toBeTruthy();
    expect(screen.getByTestId('pcb-recent-p1')).toBeTruthy();
    expect(screen.getByTestId('pcb-recent-p2')).toBeTruthy();
  });

  it('клик по недавнему проекту вызывает activateProject(id)', () => {
    seedProjects();
    const spy = vi.fn();
    useStore.setState((s) => { s.activateProject = spy; });
    render(<ProjectContextBar />);
    fireEvent.click(screen.getByTestId('pcb-switch'));
    fireEvent.click(screen.getByTestId('pcb-recent-p2'));
    expect(spy).toHaveBeenCalledWith('p2');
  });

  it('дропдаун содержит «+ Создать проект», но не «Все проекты…» (библиотека в один клик)', () => {
    seedProjects();
    render(<ProjectContextBar />);
    fireEvent.click(screen.getByTestId('pcb-switch'));
    expect(screen.getByTestId('pcb-create')).toBeTruthy();
    expect(screen.queryByTestId('pcb-all-projects')).toBeNull();
  });

  it('«+ Создать проект» вызывает createProject и открывает модалку именования', () => {
    seedProjects();
    const createSpy = vi.fn();
    const infoSpy = vi.fn();
    useStore.setState((s) => { s.createProject = createSpy; s.openProjectInfo = infoSpy; });
    render(<ProjectContextBar />);
    fireEvent.click(screen.getByTestId('pcb-switch'));
    fireEvent.click(screen.getByTestId('pcb-create'));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('активная карточка не показывает удалённый (trashed) текущий проект', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'Trashed', _pendingDelete: true, containerIds: [] } };
      s.currentProjectId = 'p1';
      s.recentProjectIds = ['p1'];
    });
    render(<ProjectContextBar />);
    // карточка в пустом состоянии — имя удалённого проекта нигде не светится
    expect(screen.getByTestId('pcb-empty')).toBeTruthy();
    expect(screen.queryByTestId('pcb-name')).toBeNull();
  });

  it('пустое состояние: «Выбрать» открывает список проектов (не уводит сразу в Библиотеку)', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'Alpha' }, p2: { id: 'p2', name: 'Beta' } };
      s.recentProjectIds = ['p1']; // p2 не в недавних — должен прийти из полного списка
      s.currentProjectId = null;
    });
    render(<ProjectContextBar />);
    expect(screen.queryByTestId('pcb-dropdown')).toBeNull();
    fireEvent.click(screen.getByTestId('pcb-choose'));
    expect(screen.getByTestId('pcb-dropdown')).toBeTruthy();
    expect(screen.getByTestId('pcb-recent-p1')).toBeTruthy();
    expect(screen.getByTestId('pcb-recent-p2')).toBeTruthy(); // полный список, не только недавние
    expect(screen.getByTestId('pcb-create')).toBeTruthy(); // «+ Создать проект» вместо «Все проекты…»
    expect(screen.queryByTestId('pcb-all-projects')).toBeNull();
  });

  it('пустое состояние: клик по проекту в списке активирует его', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'Alpha' } };
      s.recentProjectIds = [];
      s.currentProjectId = null;
    });
    const spy = vi.fn();
    useStore.setState((s) => { s.activateProject = spy; });
    render(<ProjectContextBar />);
    fireEvent.click(screen.getByTestId('pcb-choose'));
    fireEvent.click(screen.getByTestId('pcb-recent-p1'));
    expect(spy).toHaveBeenCalledWith('p1');
  });

  it('свёрнутый Sidebar: компактная иконка с именем в title', () => {
    seedProjects();
    render(<ProjectContextBar collapsed />);
    const bar = screen.getByTestId('project-context-bar');
    expect(bar.getAttribute('data-collapsed')).toBe('true');
    expect(bar.getAttribute('data-has-project')).toBe('true');
    expect(bar.getAttribute('title')).toContain('pPICZ_CBHI');
    expect(screen.queryByTestId('pcb-name')).toBeNull();
  });

  it('свёрнутый: клик по иконке открывает флай-аут со списком проектов (без разворота панели)', () => {
    seedProjects();
    render(<ProjectContextBar collapsed />);
    expect(screen.queryByTestId('pcb-dropdown')).toBeNull();
    fireEvent.click(screen.getByTestId('project-context-bar'));
    const fly = screen.getByTestId('pcb-dropdown');
    expect(fly.getAttribute('data-flyout')).toBe('true'); // portaled fixed flyout
    expect(screen.getByTestId('pcb-recent-p1')).toBeTruthy();
    expect(screen.getByTestId('pcb-recent-p2')).toBeTruthy();
    expect(screen.getByTestId('pcb-create')).toBeTruthy();
  });

  it('свёрнутый: клик по проекту во флай-ауте вызывает activateProject(id)', () => {
    seedProjects();
    const spy = vi.fn();
    useStore.setState((s) => { s.activateProject = spy; });
    render(<ProjectContextBar collapsed />);
    fireEvent.click(screen.getByTestId('project-context-bar'));
    fireEvent.click(screen.getByTestId('pcb-recent-p2'));
    expect(spy).toHaveBeenCalledWith('p2');
  });

  it('свёрнутый: флай-аут открывается даже без активного проекта (выбрать проект)', () => {
    useStore.setState((s) => { s.recentProjectIds = ['p1']; s.projects = { p1: { id: 'p1', name: 'Alpha' } }; });
    render(<ProjectContextBar collapsed />);
    fireEvent.click(screen.getByTestId('project-context-bar'));
    expect(screen.getByTestId('pcb-dropdown')).toBeTruthy();
    expect(screen.getByTestId('pcb-create')).toBeTruthy();
  });
});
