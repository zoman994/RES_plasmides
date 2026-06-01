/**
 * Sprint M-B.1 K6 — PrimerWizardStepModal unit tests (DEC-IMP-11 ⚓).
 *
 * Covers the two behaviours from §6 K6:
 *   1) Add → onAdd receives selected primers prepared with status='imported',
 *      origin metadata, and a final autoname (no collision case = name unchanged).
 *   2) Dupe detected by checkDupe → row flagged + checkbox unchecked by default;
 *      re-checking applies an autoname (M13 Forward → M13 Forward (1)).
 *
 * `addPrimerToPool` itself isn't called by the modal — Importer/index.jsx wires
 * it to the resolved selection in the Confirm flow. We assert the modal
 * surfaces the right `prepared` shape so the wiring is straightforward.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import PrimerWizardStepModal from '../modals/PrimerWizardStepModal';

beforeEach(() => cleanup());

const SAMPLE_PRIMERS = [
  { name: 'M13 Forward', sequence: 'GTAAAACGACGGCCAGT', tm: 58.2, length: 17, direction: 'forward', sourceFile: 'pUC19.dna' },
  { name: 'M13 Reverse', sequence: 'CAGGAAACAGCTATGAC', tm: 56.1, length: 17, direction: 'reverse', sourceFile: 'pUC19.dna' },
];

describe('M-B.1 K6 — PrimerWizardStepModal', () => {
  it('1) Add → onAdd receives selected primers prepared as unified-pool inputs', async () => {
    const onAdd = vi.fn();
    render(
      <PrimerWizardStepModal
        primers={SAMPLE_PRIMERS}
        existingNames={new Set()}
        checkDupe={async () => null}
        onAdd={onAdd}
        onSkip={() => {}}
        onCancel={() => {}}
      />,
    );
    // The default selection (= !dupe) is `true` immediately, but resourceHash
    // is computed asynchronously (crypto.subtle, microtask) and the no-dupe
    // case surfaces no DOM signal for readiness. Poll a trial Add until the
    // hash has settled so the assertions don't race the effect (flaky only
    // under heavy parallel-suite load; passes solo).
    let prepared;
    await waitFor(() => {
      expect(screen.getByTestId('importer-primer-check-M13 Forward').checked).toBe(true);
      expect(screen.getByTestId('importer-primer-check-M13 Reverse').checked).toBe(true);
      onAdd.mockClear();
      fireEvent.click(screen.getByTestId('importer-primer-wizard-add'));
      prepared = onAdd.mock.calls[0]?.[0];
      expect(prepared?.[0]?.resourceHash).toMatch(/^sha256:/);
    });
    expect(prepared.length).toBe(2);
    expect(prepared[0].name).toBe('M13 Forward');
    expect(prepared[0].sequence).toBe('GTAAAACGACGGCCAGT');
    expect(prepared[0]._wasDupe).toBe(false);
    expect(prepared[0].sourceFile).toBe('pUC19.dna');
    expect(prepared[0].resourceHash).toMatch(/^sha256:/);
  });

  it('2) checkDupe-positive primer is flagged + unchecked; re-check applies autoname', async () => {
    const onAdd = vi.fn();
    // checkDupe returns a hit for the M13 Forward sequence only.
    const checkDupe = vi.fn(async (hash) => {
      // Recompute is asymmetric — easier to mock once-per-call by the order
      // the modal's useEffect iterates: M13 Forward first, then Reverse.
      if (checkDupe.mock.calls.length === 1) return { id: 'p-existing', name: 'M13 Forward' };
      return null;
    });

    render(
      <PrimerWizardStepModal
        primers={SAMPLE_PRIMERS}
        existingNames={new Set(['M13 Forward'])}
        checkDupe={checkDupe}
        onAdd={onAdd}
        onSkip={() => {}}
        onCancel={() => {}}
      />,
    );

    // Forward row gets the warning chip + unchecked default.
    const forwardRow = await screen.findByTestId('importer-primer-row-M13 Forward');
    await waitFor(() => {
      expect(forwardRow.dataset.dupe).toBe('true');
      expect(screen.getByTestId('importer-primer-check-M13 Forward').checked).toBe(false);
    });
    expect(screen.getByTestId('importer-primer-dupe-M13 Forward')).toBeTruthy();
    // Reverse row stays default-checked.
    expect(screen.getByTestId('importer-primer-row-M13 Reverse').dataset.dupe).toBe('false');
    expect(screen.getByTestId('importer-primer-check-M13 Reverse').checked).toBe(true);

    // User explicitly opts in to the dupe primer.
    await act(async () => {
      fireEvent.click(screen.getByTestId('importer-primer-check-M13 Forward'));
    });
    fireEvent.click(screen.getByTestId('importer-primer-wizard-add'));

    expect(onAdd).toHaveBeenCalledOnce();
    const prepared = onAdd.mock.calls[0][0];
    expect(prepared.length).toBe(2);
    const fwd = prepared.find(p => p.sequence === 'M13 Forward'.replace(/.*/, 'GTAAAACGACGGCCAGT'));
    // The Forward primer keeps its sequence but its `name` is autonamed from
    // the existingNames set ('M13 Forward' → 'M13 Forward (1)').
    const dupeOut = prepared.find(p => p._wasDupe === true);
    expect(dupeOut).toBeTruthy();
    expect(dupeOut.name).toBe('M13 Forward (1)');
    expect(dupeOut.sequence).toBe('GTAAAACGACGGCCAGT');
  });
});
