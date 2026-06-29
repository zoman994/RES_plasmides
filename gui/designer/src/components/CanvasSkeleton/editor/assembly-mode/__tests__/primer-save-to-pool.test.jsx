/**
 * primer-save-to-pool.test.jsx — PRIMER-4 (#118): ephemeral vs durable.
 * Assembly primers are DRAFTS (recomputed by the finalizer). A «＋ в пул»
 * action promotes a draft to the DURABLE unified pool so it survives + can be
 * reused. A primer already in the pool shows «✓ в наличии» and offers no save.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { PrimerRow } from '../AssemblyPrimersPanel';
import { useStore } from '../../../../../store';
import { resetDBForTests } from '../../../../../db/dexie-schema';

const actions = { updateAssemblyPrimer: () => {}, removeAssemblyPrimer: () => {} };
const draft = {
  id: 'p1', name: 'asm-fwd', label: 'asm-fwd', direction: 'forward',
  sequence: 'ACGTACGTACGTACGTACGT', bindingSequence: 'ACGTACGTACGTACGTACGT',
  tail: '', tm: 60, gc: 50, autoMode: 'auto',
};
const row = (p = draft) => render(<PrimerRow p={p} actions={actions} draftId="d" onEdit={() => {}} />);

async function freshDB() {
  const name = `bodgegene-sp-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => { s.primersById = {}; s.toasts = []; s.currentProjectId = null; s._primersHydrated = true; });
});
afterEach(cleanup);

describe('PRIMER-4 — save draft primer to the durable pool', () => {
  it('a draft NOT in the pool shows «＋ в пул»; clicking it saves to the pool', async () => {
    row();
    const btn = screen.getByTestId('assembly-primer-save-pool-p1');
    expect(btn).toBeTruthy();
    // not yet in the pool → no reuse badge
    expect(screen.queryByTestId('assembly-primer-reuse-p1')).toBeNull();
    fireEvent.click(btn);
    // a durable pool row appears (fresh id, same binding)
    await waitFor(() => expect(Object.keys(useStore.getState().primersById).length).toBe(1));
    const saved = Object.values(useStore.getState().primersById)[0];
    expect(saved.bindingSequence).toBe('ACGTACGTACGTACGTACGT');
    expect(saved.id).not.toBe('p1'); // independent durable snapshot, not the draft id
    // the row now reflects «в наличии» and drops the save affordance
    await waitFor(() => expect(screen.getByTestId('assembly-primer-reuse-p1')).toBeTruthy());
    expect(screen.queryByTestId('assembly-primer-save-pool-p1')).toBeNull();
  });

  it('a primer already in the pool shows «✓ в наличии» and no save button', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: 'pool1', name: 'stock', direction: 'forward', bindingSequence: 'ACGTACGTACGTACGTACGT', tail: '', tm: 61 },
    });
    row();
    expect(screen.getByTestId('assembly-primer-reuse-p1')).toBeTruthy();
    expect(screen.queryByTestId('assembly-primer-save-pool-p1')).toBeNull();
  });
});
