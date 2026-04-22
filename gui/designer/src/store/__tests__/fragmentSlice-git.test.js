/**
 * Sprint X K2 — Plasmid-Git reducers + migration.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createFragmentSlice } from '../fragmentSlice';

function createTestStore() {
  return create(immer((set, get) => ({
    ...createFragmentSlice(set, get),
    assemblies: [
      { id: 'a1', name: 'asm', fragments: [], junctions: [], primers: [], apiWarnings: [] },
    ],
    activeId: 'a1',
    // Track pushUndo calls.
    _undoCount: 0,
    pushUndo: () => set(s => { s._undoCount += 1; }, false, 'pushUndo'),
  })));
}

const SEQ = 'ATGGCTAAAGAGTTT'; // M A K E F (15 nt)
function seedFragment(store) {
  store.setState(s => {
    s.assemblies[0].fragments = [{
      id: 'f1',
      name: 'test',
      sequence: SEQ,
      length: SEQ.length,
      annotations: [{ id: 'r1', start: 0, end: 15, level: 'region', type: 'CDS', name: 'test' }],
    }];
  });
}

describe('Sprint X K2 — applyMutationGit', () => {
  let store;
  beforeEach(() => { store = createTestStore(); seedFragment(store); });

  it('migration sanity: fragment without baseSnapshot + first applyMutationGit → bootstrap + commit', () => {
    const before = store.getState().assemblies[0].fragments[0];
    expect(before.baseSnapshot).toBeUndefined();

    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });

    const f = store.getState().assemblies[0].fragments[0];
    expect(f.baseSnapshot).toBeDefined();
    expect(f.baseSnapshot.sequence).toBe(SEQ); // baseline captured pre-mutation
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0].applied).toBe(true);
    expect(f.sequence.slice(3, 6)).toBe('GAA');
  });

  it('auto-override: new substitution on same codon disables prior', () => {
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GCA', label: 'A2A',
    });
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    const f = store.getState().assemblies[0].fragments[0];
    expect(f.commits).toHaveLength(2);
    expect(f.commits[0].applied).toBe(false); // first got auto-disabled
    expect(f.commits[1].applied).toBe(true);
    expect(f.sequence.slice(3, 6)).toBe('GAA');
    // apiWarning emitted
    const warn = store.getState().assemblies[0].apiWarnings.join(' ');
    expect(warn).toMatch(/заменил|codon/i);
  });

  it('toggleCommit: flip applied → sequence replayed', () => {
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    const commitId = store.getState().assemblies[0].fragments[0].commits[0].id;
    store.getState().toggleCommit(0, commitId);
    const f = store.getState().assemblies[0].fragments[0];
    expect(f.commits[0].applied).toBe(false);
    expect(f.sequence).toBe(SEQ); // back to baseline
    store.getState().toggleCommit(0, commitId);
    const f2 = store.getState().assemblies[0].fragments[0];
    expect(f2.sequence.slice(3, 6)).toBe('GAA');
  });

  it('archiveCommit: commit removed → sequence replayed without it', () => {
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    const commitId = store.getState().assemblies[0].fragments[0].commits[0].id;
    store.getState().archiveCommit(0, commitId);
    const f = store.getState().assemblies[0].fragments[0];
    expect(f.commits).toHaveLength(0);
    expect(f.sequence).toBe(SEQ);
  });

  it('setCommitMessage: commit.message updated, sequence unchanged, no pushUndo', () => {
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    const undoBefore = store.getState()._undoCount;
    const commitId = store.getState().assemblies[0].fragments[0].commits[0].id;
    const seqBefore = store.getState().assemblies[0].fragments[0].sequence;

    store.getState().setCommitMessage(0, commitId, 'rational design');

    const f = store.getState().assemblies[0].fragments[0];
    expect(f.commits[0].message).toBe('rational design');
    expect(f.sequence).toBe(seqBefore);
    expect(store.getState()._undoCount).toBe(undoBefore); // pushUndo NOT called
  });

  it('pushUndo called on applyMutationGit/toggleCommit/archiveCommit, NOT on setCommitMessage', () => {
    expect(store.getState()._undoCount).toBe(0);
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    expect(store.getState()._undoCount).toBe(1);
    const commitId = store.getState().assemblies[0].fragments[0].commits[0].id;
    store.getState().toggleCommit(0, commitId);
    expect(store.getState()._undoCount).toBe(2);
    store.getState().setCommitMessage(0, commitId, 'note');
    expect(store.getState()._undoCount).toBe(2); // unchanged
    store.getState().archiveCommit(0, commitId);
    expect(store.getState()._undoCount).toBe(3);
  });

  it('migration idempotency: calling applyMutationGit on already-bootstrapped fragment does not overwrite baseSnapshot', () => {
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
    });
    const f1 = store.getState().assemblies[0].fragments[0];
    const snapRef = f1.baseSnapshot;
    store.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 9, newCodon: 'TGG', label: 'E4W',
    });
    const f2 = store.getState().assemblies[0].fragments[0];
    expect(f2.baseSnapshot.sequence).toBe(SEQ);
    expect(f2.baseSnapshot).toBe(snapRef); // same reference, not re-bootstrapped
  });

  it('deletion commit: sequence shortens, annotations adjust, length matches', () => {
    store.getState().applyMutationGit(0, {
      type: 'deletion', dnaPosition: 3, deleteLength: 3, label: 'ΔA2',
    });
    const f = store.getState().assemblies[0].fragments[0];
    expect(f.sequence).toBe('ATGAAAGAGTTT');
    expect(f.length).toBe(12);
    expect(f.annotations[0].end).toBe(12);
  });
});
