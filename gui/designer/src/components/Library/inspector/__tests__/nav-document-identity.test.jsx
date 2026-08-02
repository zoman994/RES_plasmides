/**
 * STAGE 1 — a parked jump is applied ONLY to the document it was measured on, and to nothing else.
 *
 * `useSequenceNavConsumer` is the second half of the two-stage jump: the producer parks coordinates
 * plus the identity of the document it measured them on (`revision` + `docEpoch`), and this hook
 * decides whether the molecule on screen IS that document. Two defects live in that decision, and
 * each has a contract below.
 *
 *   1. THE EPOCH COLLIDED. It was `v<version>+e<editLog.length>/<buffer.length>` — an edit COUNT and
 *      a SIZE. A substitution moves neither; an undo rewrites the buffer without growing the log;
 *      a circular→linear flip was not in the token at all. So the hook compared two different
 *      molecules, found them equal, and painted a locus that had moved (or, for the topology flip,
 *      a locus that no longer exists — an origin-crossing hit is unreachable on a linear read).
 *
 *   2. IT FAILED OPEN. `navRequest.docEpoch == null || …` accepted any request that carried no
 *      document identity, and the revision clause was written so that a null on EITHER side passed
 *      too. A version-less molecule therefore had no stale guard whatsoever: both sides were null,
 *      both clauses passed unconditionally, and coordinates from any document were applied.
 *
 * The fixtures are the real engine's own occurrences (`searchAllSequences`), so the wrap locus here
 * is the wrap locus the product actually emits — a hand-written one could drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { useSequenceNavConsumer } from '../hooks/useSequenceNavConsumer';
import { displayedDocEpoch, entryRevision } from '../../../../lib/search-document-adapters';
import { navFromLocation } from '../../../../lib/nav-target';
import { searchAllSequences } from '../../../../lib/search-worker-core';

/** A 20-nt ring whose tail holds `AAACCC` and whose head continues `GATTAC` — the query matches ONLY
 * across the origin, so the locus exists on the circular reading and nowhere else. */
const RING = `GATTAC${'TGTGTGTG'}AAACCC`;
const WRAP_QUERY = 'AAACCCGATTAC';

const entry = (id, sequence, topology, version = 1) => ({
  id, name: `${id}-plasmid`, version, topology, sequence, annotations: [],
  payload: { sequence, topology, annotations: [] },
});

/** The occurrence the ENGINE produces — the same object a result row would hand over. */
function engineOccurrence(query, doc) {
  const env = searchAllSequences(query, [{ id: doc.id, seq: doc.sequence, topology: doc.topology }], {});
  const box = env[doc.id];
  expect(box, 'the engine must find the locus').toBeTruthy();
  return box.occurrences[box.bestIndex];
}

/**
 * The bump the production writer performs (LibraryWorkspace.onUpdateEdits). Optional-chained ONLY so
 * that the RED run reports the epoch collision these tests are about, instead of dying on a missing
 * action — the action's own existence is owned by `store/__tests__/searchSessionSlice.test.js`.
 */
const bump = (id) => act(() => { useStore.getState().bumpBufferGeneration?.(id); });
const genOf = (id) => useStore.getState().bufferGenerations?.[id] ?? 0;

/**
 * Park a jump exactly the way the in-molecule producer does (SequenceSearchHost): the coordinates
 * and the identity of the document they were measured on come from the SAME buffer.
 */
function park(item, edits, occurrence) {
  const nav = navFromLocation(occurrence.location, occurrence.metrics);
  act(() => {
    useStore.getState().requestSequenceNav(item.id, {
      ...nav,
      revision: entryRevision(item),
      // ONE builder names both readings — the same one the production consumer calls, which
      // also carries the entry's age — that is what makes a saved topology/annotation change
      // invalidate a locus the version alone cannot see.
      docEpoch: (edits && (edits.editedSequence != null || edits.editedTopology != null))
        ? displayedDocEpoch(item, edits, { entry: useStore.getState().entryGenerations?.[item.id], buffer: genOf(item.id) })
        : displayedDocEpoch(item, null, { entry: useStore.getState().entryGenerations?.[item.id] }),
    });
  });
}

function mount(item, edits, activeTab = 'sequence') {
  const spies = {
    onActiveTabChange: vi.fn(), onSelectRangeFromView: vi.fn(), scrollToPos: vi.fn(),
  };
  const view = renderHook(
    (props) => useSequenceNavConsumer({ ...props, activeTab, ...spies }),
    { initialProps: { item, edits } },
  );
  return { ...view, ...spies, hits: () => view.result.current.navHits };
}

beforeEach(() => {
  useStore.setState((s) => {
    s.navRequest = null;
    s.bufferGenerations = {};
    s.searchHits = { entryId: null, query: '', hits: [] };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('STAGE 1 — the buffer generation, not the edit count, decides which document a jump names', () => {
  it('an UNDO followed by a different same-size edit invalidates the jump AND clears its bands', () => {
    // The biologist edits a base, jumps to the wrap locus in that buffer, then undoes and types a
    // DIFFERENT base. Length identical, editLog length identical — the old token could not tell the
    // two buffers apart, so the bands from the first stayed painted over the second.
    const item = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, item);
    expect(occ.location.segments).toHaveLength(2);

    bump('w');
    const editedA = { editedSequence: `${RING.slice(0, -1)}G`, editLog: [{ op: 'sub' }] };
    const view = mount(item, editedA);
    park(item, editedA, occ);
    expect(view.hits(), 'the jump measured on THIS buffer is applied').toHaveLength(1);

    bump('w'); // the undo
    bump('w'); // …and a different substitution of the same size
    const editedB = { editedSequence: `${RING.slice(0, -1)}T`, editLog: [{ op: 'sub' }] };
    expect(editedB.editedSequence.length).toBe(editedA.editedSequence.length);
    expect(editedB.editLog.length).toBe(editedA.editLog.length);
    act(() => { view.rerender({ item, edits: editedB }); });

    expect(view.hits(), 'bands measured on the previous buffer must not survive it').toEqual([]);
  });

  it('a jump measured on the PREVIOUS buffer is refused by the current one', () => {
    const item = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, item);

    bump('w');
    const editedA = { editedSequence: `${RING.slice(0, -1)}G`, editLog: [{ op: 'sub' }] };
    const staleEpoch = displayedDocEpoch(item, editedA, { entry: useStore.getState().entryGenerations?.w, buffer: genOf('w') });

    bump('w');
    const editedB = { editedSequence: `${RING.slice(0, -1)}T`, editLog: [{ op: 'sub' }] };
    const view = mount(item, editedB);

    const nav = navFromLocation(occ.location, occ.metrics);
    act(() => {
      useStore.getState().requestSequenceNav('w', { ...nav, revision: 1, docEpoch: staleEpoch });
    });

    expect(view.onSelectRangeFromView).not.toHaveBeenCalled();
    expect(view.scrollToPos).not.toHaveBeenCalled();
    expect(view.hits()).toEqual([]);
    expect(useStore.getState().navRequest, 'dropped, not left pending').toBeNull();
  });

  it('flipping the displayed topology circular→linear invalidates the wrap locus', () => {
    // The wrap hit only exists on the ring. Reading the same molecule as linear makes those two
    // segments a claim about a junction that is no longer there — the bands must go, and a jump
    // measured on the circular reading must not be applied to the linear one.
    const item = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, item);

    bump('w');
    const asRing = { editedTopology: 'circular' };
    const view = mount(item, asRing);
    park(item, asRing, occ);
    expect(view.hits(), 'the wrap is painted while the ring is on screen').toHaveLength(1);

    bump('w');
    const asLinear = { editedTopology: 'linear' };
    act(() => { view.rerender({ item, edits: asLinear }); });
    expect(view.hits(), 'a linear reading has no origin-crossing locus').toEqual([]);

    // …and re-parking the circular measurement now changes nothing at all.
    view.onSelectRangeFromView.mockClear();
    const nav = navFromLocation(occ.location, occ.metrics);
    act(() => {
      useStore.getState().requestSequenceNav('w', {
        ...nav, revision: 1, docEpoch: displayedDocEpoch(item, asRing, { entry: useStore.getState().entryGenerations?.w, buffer: 1 }),
      });
    });
    expect(view.onSelectRangeFromView).not.toHaveBeenCalled();
    expect(view.hits()).toEqual([]);
    expect(useStore.getState().navRequest).toBeNull();
  });
});

describe('STAGE 1 — a jump that cannot be verified changes NOTHING (fail-closed)', () => {
  it('a request carrying no docEpoch and no revision moves no caret, no scroll, no tab, no band', () => {
    const item = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, item);
    const nav = navFromLocation(occ.location, occ.metrics);
    // Standing on the Annotations tab: a fail-open would ALSO yank the biologist to Sequence.
    const view = mount(item, {}, 'annotations');

    act(() => {
      useStore.getState().requestSequenceNav('w', { ...nav, revision: null, docEpoch: null });
    });

    expect(view.onSelectRangeFromView).not.toHaveBeenCalled();
    expect(view.scrollToPos).not.toHaveBeenCalled();
    expect(view.onActiveTabChange).not.toHaveBeenCalled();
    expect(view.hits()).toEqual([]);
    expect(useStore.getState().navRequest, 'the unverifiable request is cleared').toBeNull();
  });

  it('a molecule with NO revision cannot verify anything — its own epoch is not a proof', () => {
    // Both sides serialise to `v?`, so an epoch comparison «succeeds» while proving nothing: every
    // version-less molecule wears the same token, and so does every one of its saved states.
    const noVersion = { id: 'w', name: 'legacy', topology: 'circular', sequence: RING, payload: { sequence: RING, topology: 'circular' } };
    expect(entryRevision(noVersion)).toBeNull();
    const occ = engineOccurrence(WRAP_QUERY, entry('w', RING, 'circular'));
    const nav = navFromLocation(occ.location, occ.metrics);
    const view = mount(noVersion, {});

    act(() => {
      useStore.getState().requestSequenceNav('w', { ...nav, revision: null, docEpoch: 'v?' });
    });

    expect(view.onSelectRangeFromView).not.toHaveBeenCalled();
    expect(view.hits()).toEqual([]);
    expect(useStore.getState().navRequest).toBeNull();
  });

  it('a fully verified request still lands — fail-closed is not «never»', () => {
    const item = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, item);
    const view = mount(item, {}, 'annotations');
    park(item, {}, occ);

    expect(view.onSelectRangeFromView).toHaveBeenCalledWith(14, 20, 'dna', 1);
    expect(view.scrollToPos).toHaveBeenCalledWith(14);
    expect(view.onActiveTabChange).toHaveBeenCalledWith('sequence');
    expect(view.hits()).toHaveLength(1);
    expect(view.hits()[0].location.segments).toEqual([{ start: 14, end: 20 }, { start: 0, end: 6 }]);
    expect(useStore.getState().navRequest).toBeNull();
  });
});
