import { describe, it, expect } from 'vitest';
import { buildBreadcrumb } from '../breadcrumb.js';

describe('breadcrumb — buildBreadcrumb', () => {
  it('cross-project tools → «Инструменты → {окно}»', () => {
    expect(buildBreadcrumb({ workspaceActive: 'library' })).toEqual([
      { label: 'Инструменты', kind: 'tool' },
      { label: 'Библиотека', kind: 'window', current: true },
    ]);
    expect(buildBreadcrumb({ workspaceActive: 'align' })[1]).toEqual({ label: 'Выравнивание', kind: 'window', current: true });
    expect(buildBreadcrumb({ workspaceActive: 'importer' })[1].label).toBe('Импорт');
  });

  it('canvasSkeleton → окно проекта с именем активного проекта', () => {
    const r = buildBreadcrumb({ activeFullscreen: 'canvasSkeleton', projectName: 'pPICZ_CBHI' });
    expect(r).toEqual([
      { label: 'pPICZ_CBHI', kind: 'project' },
      { label: 'Сборки', kind: 'window', current: true },
    ]);
  });

  it('overlay (activeFullscreen) перекрывает workspace.active', () => {
    const r = buildBreadcrumb({ activeFullscreen: 'containerWindow', workspaceActive: 'library', projectName: 'P' });
    expect(r[0]).toEqual({ label: 'P', kind: 'project' });
    expect(r[1].label).toBe('Контейнер');
  });

  it('без имени проекта — fallback «Проект»', () => {
    expect(buildBreadcrumb({ activeFullscreen: 'canvasSkeleton' })[0].label).toBe('Проект');
  });

  it('системные overlay-состояния — одиночная крошка', () => {
    expect(buildBreadcrumb({ activeFullscreen: 'multiTabBlocked' })).toEqual([
      { label: 'Открыто в другой вкладке', kind: 'system', current: true },
    ]);
    expect(buildBreadcrumb({ activeFullscreen: 'underConstruction' })[0].label).toBe('В разработке');
    expect(buildBreadcrumb({ activeFullscreen: 'readOnlyForced', projectName: 'P' })[1].label).toBe('Только чтение');
  });

  it('start / startup → Главная', () => {
    expect(buildBreadcrumb({ activeFullscreen: 'start' })[0].label).toBe('Главная');
    expect(buildBreadcrumb({ workspaceActive: 'startup' })[0].label).toBe('Главная');
  });

  it('последняя крошка всегда current', () => {
    for (const inp of [{ workspaceActive: 'library' }, { activeFullscreen: 'canvasSkeleton' }, {}]) {
      const r = buildBreadcrumb(inp);
      expect(r[r.length - 1].current).toBe(true);
    }
  });

  it('пустой/неизвестный вход — «Рабочая область»', () => {
    expect(buildBreadcrumb({})[0].label).toBe('Рабочая область');
    expect(buildBreadcrumb()[0].label).toBe('Рабочая область');
  });
});
