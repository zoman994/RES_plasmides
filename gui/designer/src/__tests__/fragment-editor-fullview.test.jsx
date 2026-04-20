/**
 * K11 (Sprint 1.7) — FragmentEditor full-view UI for split sub-fragments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import FragmentEditor, { computeFullViewHighlights } from '../components/FragmentEditor';

beforeEach(() => { window.confirm = vi.fn(() => true); });

function subFragment(extras = {}) {
  // HygroR_2 analog: sub-fragment spanning [42..141) of a 1500-bp parent.
  const parentLen = 1500;
  return {
    id: 'sub2', name: 'HygroR_2', type: 'CDS',
    sequence: 'ACGT'.repeat(25),  // 100 bp sub
    length: 100, strand: 1,
    templateStart: 42,
    templateEnd: 142,
    annotations: [],
    mutations: [],
    splitGroupId: 'sg_test',
    splitGroupParentName: 'HygroR',
    splitGroupIndex: 1,
    splitGroupTotal: 2,
    splitGroupFullSequence: 'A'.repeat(42) + 'ACGT'.repeat(25) + 'T'.repeat(parentLen - 142),
    splitGroupFullLength: parentLen,
    splitGroupFullParentMutations: [
      { type: 'substitution', label: 'E20A', codonStart: 60, newCodon: 'GCG' },
    ],
    ...extras,
  };
}

describe('computeFullViewHighlights', () => {
  it('maps each mutation to its nt span (3 bp for substitution)', () => {
    const frag = {
      splitGroupFullParentMutations: [
        { type: 'substitution', codonStart: 60 },
        { type: 'nt_deletion', codonStart: 100, deletedBp: 5 },
      ],
    };
    const m = computeFullViewHighlights(frag);
    // sub at 60..63
    for (let i = 60; i < 63; i++) expect(m.get(i)).toBe('nonsilent');
    // del at 100..105
    for (let i = 100; i < 105; i++) expect(m.get(i)).toBe('nonsilent');
    expect(m.get(59)).toBeUndefined();
    expect(m.get(63)).toBeUndefined();
  });

  it('empty list → empty map', () => {
    expect(computeFullViewHighlights({}).size).toBe(0);
    expect(computeFullViewHighlights(null).size).toBe(0);
  });
});

describe('K11 — FragmentEditor full-view UI', () => {
  it('renders full-view toggle ONLY when splitGroupFullSequence is present', () => {
    // Without full sequence → no toggle
    const plain = { id: 'f', name: 'Plain', type: 'CDS', sequence: 'ATGTAA', length: 6, strand: 1, annotations: [], mutations: [] };
    const { unmount } = render(<FragmentEditor fragment={plain} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Полный ген/ })).toBeNull();
    unmount();

    // With full sequence → toggle present
    render(<FragmentEditor fragment={subFragment()} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Фрагмент \(100 п\.н\.\)/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Полный ген \(1500 п\.н\.\)/ })).not.toBeNull();
  });

  it('defaults to sub view; switches to full view on toggle click', () => {
    render(<FragmentEditor fragment={subFragment()} onSave={() => {}} onClose={() => {}} />);
    // Initially: full-view grid is not mounted
    expect(document.querySelector('[data-testid="fragment-editor-full-view"]')).toBeNull();

    // Click «Полный ген»
    fireEvent.click(screen.getByRole('button', { name: /Полный ген/ }));
    expect(document.querySelector('[data-testid="fragment-editor-full-view"]')).not.toBeNull();
    // Virtual-view banner
    expect(screen.queryByText(/Виртуальный вид/)).not.toBeNull();
  });

  it('full-view sequence length matches splitGroupFullLength', () => {
    render(<FragmentEditor fragment={subFragment()} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Полный ген/ }));
    const grid = document.querySelector('[data-testid="fragment-editor-full-view"]');
    expect(grid).not.toBeNull();
    // Count nt spans (each <span> inside lines has exactly one letter nt)
    const ntSpans = grid.querySelectorAll('span > span');
    // splitGroupFullLength = 1500 — at least 1500 spans (plus line-number spans which are outer spans)
    // We count inner-text letter spans via a simple heuristic: spans whose textContent is a single letter A/T/G/C
    const letterCount = Array.from(grid.querySelectorAll('span'))
      .filter(s => s.textContent?.length === 1 && /[ATGC]/.test(s.textContent)).length;
    expect(letterCount).toBe(1500);
  });

  it('edit-mode button is disabled in full view', () => {
    render(<FragmentEditor fragment={subFragment()} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Полный ген/ }));
    // CDS + view mode → text is "✏️ Редакт. кодоны" (role=button, not radio)
    const editBtn = Array.from(document.querySelectorAll('button'))
      .find(b => /Редакт\. кодоны/.test(b.textContent || ''));
    expect(editBtn).toBeDefined();
    expect(editBtn.disabled).toBe(true);
  });

  it('annotations panel shows notice instead of editor in full view', () => {
    render(<FragmentEditor fragment={subFragment()} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Полный ген/ }));
    expect(screen.queryByText(/В полном обзоре аннотации недоступны/)).not.toBeNull();
  });
});
