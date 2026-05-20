/**
 * AE-K1 — EmptyAssemblyHint render content.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyAssemblyHint from '../EmptyAssemblyHint';

describe('AE-K1 — EmptyAssemblyHint', () => {
  it('renders the empty hint with 4 entry-point list items', () => {
    render(<EmptyAssemblyHint />);
    const hint = screen.getByTestId('assembly-empty-hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('Скелет сборки пуст');
    expect(hint.textContent).toContain('+ Плазмида');
    expect(hint.textContent).toContain('+ Обвес');
    expect(hint.textContent).toContain('+ Синтез');
    expect(hint.textContent).toContain('+ Gap');
  });

  it('mentions Realise as DAG cta upstream', () => {
    render(<EmptyAssemblyHint />);
    expect(screen.getByTestId('assembly-empty-hint').textContent)
      .toMatch(/Realise as DAG/);
  });

  it('contains the package emoji marker', () => {
    render(<EmptyAssemblyHint />);
    expect(screen.getByTestId('assembly-empty-hint').textContent).toContain('📦');
  });
});
