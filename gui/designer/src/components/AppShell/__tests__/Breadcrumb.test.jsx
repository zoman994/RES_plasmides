import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../store';
import Breadcrumb from '../Breadcrumb';

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((s) => {
    s.workspace = { active: 'library', history: [], context: {} };
    s.canvas = { ...(s.canvas || {}), activeFullscreen: null };
    s.currentProjectId = null;
    s.projects = {};
  });
});
afterEach(cleanup);

function crumbTexts() {
  return screen.getAllByTestId('breadcrumb-crumb').map((e) => e.textContent.trim());
}

describe('Breadcrumb — фаза 2: «где я сейчас»', () => {
  it('Библиотека → «Инструменты › Библиотека»', () => {
    useStore.setState((s) => { s.workspace = { active: 'library', history: [], context: {} }; });
    render(<Breadcrumb />);
    expect(crumbTexts()).toEqual(['Инструменты', 'Библиотека']);
  });

  it('Выравнивание → «Инструменты › Выравнивание»', () => {
    useStore.setState((s) => { s.workspace = { active: 'align', history: [], context: {} }; });
    render(<Breadcrumb />);
    expect(crumbTexts()).toEqual(['Инструменты', 'Выравнивание']);
  });

  it('канвас проекта → «{имя} › Сборки» с проектной крошкой', () => {
    useStore.setState((s) => {
      s.canvas = { ...(s.canvas || {}), activeFullscreen: 'canvasSkeleton' };
      s.projects = { p1: { id: 'p1', name: 'pPICZ_CBHI' } };
      s.currentProjectId = 'p1';
    });
    render(<Breadcrumb />);
    const crumbs = screen.getAllByTestId('breadcrumb-crumb');
    expect(crumbs[0].textContent).toContain('pPICZ_CBHI');
    expect(crumbs[0].getAttribute('data-kind')).toBe('project');
    expect(crumbs[1].textContent).toBe('Сборки');
  });

  it('последняя крошка помечена current', () => {
    render(<Breadcrumb />);
    const crumbs = screen.getAllByTestId('breadcrumb-crumb');
    expect(crumbs[crumbs.length - 1].getAttribute('data-current')).toBe('true');
    expect(crumbs[0].getAttribute('data-current')).toBe('false');
  });

  it('проектная крошка КЛИКАБЕЛЬНА → popFullscreen (выход из оверлея канваса)', () => {
    const spy = vi.fn();
    useStore.setState((s) => {
      s.canvas = { ...(s.canvas || {}), activeFullscreen: 'canvasSkeleton' };
      s.projects = { p1: { id: 'p1', name: 'pPICZ_CBHI' } };
      s.currentProjectId = 'p1';
      s.popFullscreen = spy;
    });
    render(<Breadcrumb />);
    const crumbs = screen.getAllByTestId('breadcrumb-crumb');
    expect(crumbs[0].getAttribute('data-kind')).toBe('project');
    expect(crumbs[0].getAttribute('role')).toBe('button');
    fireEvent.click(crumbs[0]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('не-проектные крошки (tool/window) НЕ кликабельны — popFullscreen не зовётся', () => {
    const spy = vi.fn();
    useStore.setState((s) => {
      s.workspace = { active: 'library', history: [], context: {} };
      s.canvas = { ...(s.canvas || {}), activeFullscreen: null };
      s.popFullscreen = spy;
    });
    render(<Breadcrumb />);
    const crumbs = screen.getAllByTestId('breadcrumb-crumb');
    crumbs.forEach((c) => {
      expect(c.getAttribute('role')).not.toBe('button');
      fireEvent.click(c);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
