/**
 * Kfix-7 — mop-up regressions: dropdown auto-flip + legacy AddFragmentModal
 * entry points removal (F-G in DesignCanvas «начать с нуля» empty-state,
 * F-P in PartsPalette bottom-actions). Progress UI hookup is covered by
 * import-disclosure-kfix6.test.jsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';

describe('F-N ActionsBar dropdown opens upward', () => {
  it('the secondary popup uses bottom-full (opens up), not top-full (opens down)', () => {
    const { getByText, getByTestId } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} />
    );
    fireEvent.click(getByText('Действия ▾'));
    const popup = getByTestId('actions-secondary-popup');
    expect(popup.className).toMatch(/bottom-full/);
    expect(popup.className).not.toMatch(/top-full/);
  });
});

// F-G / F-P: structural negative assertions. We don't render the full
// DesignCanvas / PartsPalette here (heavy stores) — instead we assert at
// the source level via Vite's import → string match. Cheaper and stable.
import fs from 'node:fs';
import path from 'node:path';

describe('F-G DesignCanvas «начать с нуля» — no AddFragmentModal entry point', () => {
  it('blank-mode branch does not contain «+ Добавить фрагмент по последовательности» button', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/DesignCanvas.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/Добавить фрагмент по последовательности/);
  });
});

describe('F-P PartsPalette bottom-actions — no «✏️ Вставить»', () => {
  it('PartsPalette source no longer contains «Вставить» button text in bottom-actions block', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/PartsPalette.jsx'),
      'utf8',
    );
    // Only the header reference in the comment remains; the actual button text is gone.
    // The pattern '✏️ Вставить' appeared only in the deleted button.
    expect(src).not.toMatch(/✏️\}\s*Вставить/);
  });
});
