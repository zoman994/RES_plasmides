/**
 * PrimerBindingSites — PRIMER-5 UI. Pins the multi-binding warning (≥2 priming
 * sites) and the «± мисматчи» toggle that surfaces weakly-complementary sites.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrimerBindingSites from '../PrimerBindingSites';
import { useStore } from '../../store';

const Q = 'ACGTGGCATTGA'; // 12-nt binding (≥ default minLen 12)

function seedLib(entries) {
  const byId = {};
  for (const e of entries) byId[e.id] = e;
  // _libraryHydrated:true so the component's idempotent hydrate effect no-ops
  // (else it would reset libraryEntries to the empty test Dexie, wiping the seed).
  useStore.setState({ libraryEntries: byId, _libraryHydrated: true });
}

beforeEach(() => {
  try { useStore.setState({ libraryEntries: {}, _libraryHydrated: true }); } catch { /* */ }
});

describe('PrimerBindingSites — specificity (PRIMER-5)', () => {
  it('two exact sites in one molecule → multi-binding warning', () => {
    seedLib([{ id: 'e1', name: 'molA', payload: { sequence: `${Q}TTTT${Q}`, topology: 'linear' } }]);
    render(<PrimerBindingSites primer={{ bindingSequence: Q }} />);
    expect(screen.getByTestId('primer-binding-multibinding')).toBeTruthy();
  });

  it('single exact site → no multi-binding warning', () => {
    seedLib([{ id: 'e1', name: 'molA', payload: { sequence: `TTTT${Q}TTTT`, topology: 'linear' } }]);
    render(<PrimerBindingSites primer={{ bindingSequence: Q }} />);
    expect(screen.queryByTestId('primer-binding-multibinding')).toBeNull();
  });

  it('exact-only by default; «± мисматчи» reveals a weak (1-mismatch) site', () => {
    // one internal-mismatch site only (pos2 G→A): not found exact, found fuzzy
    seedLib([{ id: 'e1', name: 'molA', payload: { sequence: 'TTTTACATGGCATTGATTTT', topology: 'linear' } }]);
    render(<PrimerBindingSites primer={{ bindingSequence: Q }} />);
    expect(screen.getByTestId('primer-binding-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('primer-binding-fuzzy-toggle'));
    expect(screen.queryByTestId('primer-binding-empty')).toBeNull();
    // a weak hit row is rendered (contains the molecule name)
    expect(screen.getByTestId('primer-binding-sites').textContent).toContain('molA');
    expect(screen.getByTestId('primer-binding-sites').textContent).toContain('мисмат');
  });
});
