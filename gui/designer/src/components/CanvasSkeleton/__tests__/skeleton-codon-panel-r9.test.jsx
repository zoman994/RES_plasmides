/**
 * skeleton-codon-panel-r9.test.jsx — CodonStatsPanel UI tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkeletonProvider, useSkeletonActions } from '../store/skeleton-context';
import CodonStatsPanel from '../CodonStatsPanel';
import { useEffect } from 'react';

function HighlightSetter({ container }) {
  const actions = useSkeletonActions();
  useEffect(() => {
    if (!container) return;
    actions.addContainer(container);
    actions.setHighlight(container.id);
  }, [actions, container]);
  return null;
}

function renderWith(container) {
  return render(
    <SkeletonProvider>
      <HighlightSetter container={container} />
      <CodonStatsPanel />
    </SkeletonProvider>,
  );
}

describe('R9-3 — CodonStatsPanel', () => {
  it('Hidden when no container highlighted', () => {
    render(
      <SkeletonProvider>
        <CodonStatsPanel />
      </SkeletonProvider>,
    );
    expect(screen.queryByTestId('skeleton-codon-toggle')).toBeNull();
  });

  it('Button shows when container highlighted', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'tpl',
      sequence: 'ATGTTCTAA', topology: { circular: false },
      annotations: [{ name: 'cds', type: 'CDS', start: 0, end: 9 }],
    };
    renderWith(c);
    expect(screen.getByTestId('skeleton-codon-toggle')).toBeTruthy();
  });

  it('Panel opens on click', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'tpl',
      sequence: 'ATGTTCTAA', topology: { circular: false },
      annotations: [{ name: 'mygene', type: 'CDS', start: 0, end: 9 }],
    };
    renderWith(c);
    fireEvent.click(screen.getByTestId('skeleton-codon-toggle'));
    expect(screen.getByTestId('skeleton-codon-panel')).toBeTruthy();
    expect(screen.getByText(/mygene/)).toBeTruthy();
  });

  it('Shows "нет CDS" when container без CDS annotations', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'tpl',
      sequence: 'ATCGATCG', topology: { circular: false },
      annotations: [{ name: 'p', type: 'promoter', start: 0, end: 8 }],
    };
    renderWith(c);
    fireEvent.click(screen.getByTestId('skeleton-codon-toggle'));
    expect(screen.getByText(/нет CDS/i)).toBeTruthy();
  });

  it('Rare codon CDS shows optimized variant', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'rare',
      sequence: 'ATGTTTTTAATATAA', topology: { circular: false },
      annotations: [{ id: 'g', name: 'gene', type: 'CDS', start: 0, end: 15 }],
    };
    renderWith(c);
    fireEvent.click(screen.getByTestId('skeleton-codon-toggle'));
    const card = screen.getByTestId('skeleton-codon-card-g');
    expect(card).toBeTruthy();
    // Rare codons present.
    expect(card.textContent).toMatch(/Rare codons/);
    expect(card.textContent).toMatch(/TTT/);
  });
});
