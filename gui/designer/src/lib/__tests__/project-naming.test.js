import { describe, it, expect } from 'vitest';
import { pickUniqueProjectName } from '../project-naming.js';

describe('project-naming — pickUniqueProjectName', () => {
  it('пустой набор → база «Новый проект»', () => {
    expect(pickUniqueProjectName({})).toBe('Новый проект');
    expect(pickUniqueProjectName(null)).toBe('Новый проект');
  });
  it('коллизия → суффикс с номером, начиная с 2', () => {
    expect(pickUniqueProjectName({ p1: { name: 'Новый проект' } })).toBe('Новый проект 2');
    expect(pickUniqueProjectName({
      p1: { name: 'Новый проект' }, p2: { name: 'Новый проект 2' },
    })).toBe('Новый проект 3');
  });
  it('регистронезависимо', () => {
    expect(pickUniqueProjectName({ p1: { name: 'НОВЫЙ ПРОЕКТ' } })).toBe('Новый проект 2');
  });
  it('игнорирует помеченные на удаление', () => {
    expect(pickUniqueProjectName({ p1: { name: 'Новый проект', _pendingDelete: true } }))
      .toBe('Новый проект');
  });
  it('кастомная база', () => {
    expect(pickUniqueProjectName({ p1: { name: 'Сборка' } }, 'Сборка')).toBe('Сборка 2');
  });
});
