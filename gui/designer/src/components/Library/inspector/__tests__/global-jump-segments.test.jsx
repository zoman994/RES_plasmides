/**
 * U5-A — the global-search jump lands on the WHOLE locus, through the real chain.
 *
 * The row hands over an occurrence (owned by `library-topbar-row-locus`), `makeOpenEntry` parks it on
 * the store channel, and LibrarySingleInspector consumes it once the molecule is mounted. That last
 * hop is where the locus used to be flattened: the consumer read `caret` / `segments[0]` and threw
 * the rest away, so an ORIGIN-CROSSING hit — which occupies the tail AND the head of the plasmid —
 * showed the biologist its first half and silently hid the second. A caret is one contiguous range;
 * the molecule needs both bands.
 *
 * The occurrence here is not hand-written: it comes out of the real engine, so the fixture cannot
 * drift away from what the search actually emits.
 *
 * Division of proof: `search-hits-overlay` owns «a canonical 2-segment occurrence paints two bands on
 * the right strands». This file owns «the jump delivers that canonical occurrence, unflattened, to
 * the channel that paints it» — and the caret/scroll/strand the selection still gets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { makeOpenEntry } from '../../../../lib/open-entry-action';
import { resolveSearchPick } from '../../../../lib/search-pick-route';
import { entryToDocument } from '../../../../lib/search-document-adapters';
import { searchAllSequences } from '../../../../lib/search-worker-core';

// Capture what the inspector hands the viewer. SequenceTab is the seam every selection prop crosses
// (precedent: assembly-primers / editable-assembly tests), so mocking it keeps the heavy viewer out
// while still testing the REAL consumer effect inside LibrarySingleInspector.
const seqTabProps = { current: null };
vi.mock('../tabs/SequenceTab', () => ({
  default: (props) => {
    seqTabProps.current = props;
    return <div data-testid="mock-sequence-tab" />;
  },
}));
vi.mock('../../../SequenceView/SettingsPopover', () => ({ default: () => null, SEQUENCE_VIEW_DEFAULTS: {} }));
vi.mock('../../../PlasmidMiniMap', () => ({ default: () => <div data-testid="mock-mini-map" /> }));
// The Annotations tab mounts the embedded Annotator (predictors + LevelPanel + its own preview). It
// is not the subject here, and rendering it for real made the `activeTab="annotations"` case blow
// past the 5 s test timeout intermittently — a hang, not an assertion failure.
vi.mock('../tabs/AnnotationsTab', () => ({ default: () => <div data-testid="mock-annotations-tab" /> }));

// Imported after the mocks for readability only — Vitest hoists `vi.mock` above every import.
import SingleInspector from '../LibrarySingleInspector';

// A 20-nt ring whose tail holds `AAACCC` and whose head continues `GATTAC`: the query matches ONLY
// across the origin, so one merged range would name a span that does not exist on the plasmid.
const RING = `GATTAC${'TGTGTGTG'}AAACCC`;
const WRAP_QUERY = 'AAACCCGATTAC';
// A linear molecule carrying the motif on the PLUS strand; searching its reverse complement gives a
// single MINUS-strand locus — one contiguous range, which the caret can express on its own.
const MOTIF = 'GAATTCACGTAA';
const LINEAR = `AAA${MOTIF}TTT`;
const RC = 'TTACGTGAATTC';

/**
 * A REAL library entry: `version` is what `librarySlice` maintains (created at 1, bumped by every
 * saved commit). No `origin.revision` — production never writes it, and a fixture that invents one
 * proves the guard against a field that does not exist.
 */
const entry = (id, sequence, topology, version = 1) => ({
  id,
  name: `${id}-plasmid`,
  projectId: null,
  version,
  topology,
  sequence,
  length: sequence.length,
  annotations: [],
  payload: { sequence, length: sequence.length, topology, annotations: [] },
});

/** The occurrence the ENGINE produces for this query — the same object a row would hand over. */
function engineOccurrence(query, doc) {
  const env = searchAllSequences(query, [{ id: `entry:${doc.id}`, seq: doc.sequence, topology: doc.topology }], {});
  const box = env[`entry:${doc.id}`];
  expect(box, 'engine must find the locus').toBeTruthy();
  return box.occurrences[box.bestIndex];
}

/**
 * The real production sink: the pure router decides the action AND carries the revision the RESULT
 * was computed on, then `makeOpenEntry` parks it. `searchedDoc` is the entry the search actually ran
 * against — which is NOT necessarily the entry in the store when the user finally clicks.
 */
function openEntryFor(searchedDoc, occurrence, storeDoc = searchedDoc) {
  // The ref the ROW carries in production: built by the adapter at search time, so it holds the
  // document epoch (version + the entry's age) the results were computed against.
  const entityRef = entryToDocument(searchedDoc, {
    generation: useStore.getState().entryGenerations?.[searchedDoc.id],
  }).ref;
  const action = resolveSearchPick(entityRef, occurrence);
  const openEntry = makeOpenEntry({
    getEntry: (id) => (id === storeDoc.id ? storeDoc : undefined),
    guardedSelect: () => true,
    activateProject: () => {},
    setView: () => {},
    setSelectedId: () => {},
    initPerEntryState: () => {},
    requestSequenceNav: (id, target) => useStore.getState().requestSequenceNav(id, target),
  });
  act(() => { openEntry(action.id, action.occurrence, action.revision, action.docEpoch); });
}

function mountInspector(doc, { activeTab = 'sequence', edits = {} } = {}) {
  const onActiveTabChange = vi.fn();
  const utils = render(
    <SingleInspector
      item={doc}
      flags={{ autoAnnotate: false }}
      edits={edits}
      activeTab={activeTab}
      onActiveTabChange={onActiveTabChange}
      onUpdateFlags={() => {}}
      onUpdateEdits={() => {}}
      onAppendAdded={() => {}}
      onRenameItem={() => {}}
    />,
  );
  return { ...utils, onActiveTabChange };
}

/** The global-navigation highlight the inspector owns — NOT the Ctrl+F `searchHits` slice. */
const navHits = () => (seqTabProps.current && seqTabProps.current.navHits) || [];

beforeEach(() => {
  seqTabProps.current = null;
  useStore.setState((s) => {
    s.navRequest = null;
    s.searchHits = { entryId: null, query: '', hits: [] };
    s.entryGenerations = {};
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('U5-A — a jump opens the whole locus, not its first segment', () => {
  it('sanity: the engine really reports the wrap as TWO segments across the origin', () => {
    const doc = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, doc);
    expect(occ.location.wrapsOrigin).toBe(true);
    expect(occ.location.segments).toEqual([{ start: 14, end: 20 }, { start: 0, end: 6 }]);
  });

  it('an ORIGIN-WRAP jump highlights BOTH physical segments and centres on the tail', () => {
    const doc = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, doc);
    mountInspector(doc);
    openEntryFor(doc, occ);

    // The selection still holds the first (tail) segment and the viewer is force-centred on it —
    // that is where reading the hit starts.
    expect(seqTabProps.current.caretAnchor).toBe(14);
    expect(seqTabProps.current.caretPos).toBe(20);
    expect(seqTabProps.current.pendingScroll.pos).toBe(14);

    // …and the SECOND segment is not lost: the canonical occurrence reaches the multi-band overlay,
    // unflattened and with its strand and topology intact — through the navigation owner's OWN
    // highlight, not through the Ctrl+F slice.
    const hits = navHits();
    expect(hits).toHaveLength(1);
    expect(hits[0].location.segments).toEqual([{ start: 14, end: 20 }, { start: 0, end: 6 }]);
    expect(hits[0].location.wrapsOrigin).toBe(true);
    expect(hits[0].location.strand).toBe(occ.location.strand);
    expect(hits[0].metrics.identityBps).toBe(occ.metrics.identityBps);

    // The channel is acked, so a remount cannot replay the jump.
    expect(useStore.getState().navRequest).toBeNull();
  });

  it('a MINUS-strand single-range locus keeps its strand and leaves the overlay channel alone', () => {
    const doc = entry('m', LINEAR, 'linear');
    const occ = engineOccurrence(RC, doc);
    expect(occ.location.strand).toBe('-');
    expect(occ.location.segments).toHaveLength(1);

    mountInspector(doc);
    openEntryFor(doc, occ);

    expect(seqTabProps.current.caretAnchor).toBe(3);
    expect(seqTabProps.current.caretPos).toBe(15);
    expect(seqTabProps.current.selectionStrand).toBe(-1); // the bottom strand, where the hit is
    expect(seqTabProps.current.pendingScroll.pos).toBe(3);

    // One contiguous single-strand range IS fully expressible as a selection, so no overlay band is
    // needed — and the Ctrl+F channel is never touched by a global jump at all.
    expect(navHits()).toEqual([]);
    expect(useStore.getState().searchHits.hits).toEqual([]);
  });

  it('a jump whose revision no longer matches the molecule is DROPPED, not applied elsewhere', () => {
    const doc = entry('w', RING, 'circular', 1);
    const occ = engineOccurrence(WRAP_QUERY, doc);
    // The molecule the inspector shows has been SAVED since the search answered: version 1 → 2.
    const saved = entry('w', RING, 'circular', 2);
    mountInspector(saved);
    openEntryFor(doc, occ, saved);

    expect(seqTabProps.current.caretPos).toBeNull();
    expect(navHits()).toEqual([]);
    expect(useStore.getState().searchHits.hits).toEqual([]);
    expect(useStore.getState().navRequest).toBeNull(); // dropped, not left pending
  });
});

// ── U5-A · WHO OWNS THE HIGHLIGHT ─────────────────────────────────────────────────────────────
/**
 * `searchHits` belongs to the in-molecule Ctrl+F search (uiSlice: «current Ctrl+F search hits, scoped
 * to one entry»). A global jump that writes there is not sharing a channel, it is destroying another
 * feature's state: the biologist's find-all list disappears, closing Ctrl+F wipes the jump highlight,
 * and — worst — a later single-range jump leaves the OLD wrap bands painted next to the new locus,
 * which reads as a hit that is not there.
 */
describe('U5-A — the global jump owns its own highlight, Ctrl+F keeps its channel', () => {
  const CTRL_F = {
    entryId: 'w',
    query: 'TGTGTGTG',
    hits: [{ location: { segments: [{ start: 6, end: 14 }], strand: '+', wrapsOrigin: false }, metrics: { identityBps: 10000 } }],
  };
  const seedCtrlF = () => { useStore.setState((s) => { s.searchHits = { ...CTRL_F }; }); };

  it('a global WRAP jump leaves an open Ctrl+F search on the SAME molecule untouched', () => {
    const doc = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, doc);
    seedCtrlF();
    mountInspector(doc);
    openEntryFor(doc, occ);

    // The find-all state the biologist is working with — query AND hits — survives verbatim.
    const slice = useStore.getState().searchHits;
    expect(slice.query).toBe('TGTGTGTG');
    expect(slice.hits).toEqual(CTRL_F.hits);
    // …while the jump's own two-segment highlight arrives beside it, not instead of it.
    expect(navHits()).toHaveLength(1);
    expect(navHits()[0].location.segments).toHaveLength(2);
  });

  it('CLOSING Ctrl+F does not erase the global highlight', () => {
    const doc = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, doc);
    seedCtrlF();
    mountInspector(doc);
    openEntryFor(doc, occ);
    expect(navHits()).toHaveLength(1);

    // Esc on the popover clears ITS slice. The jump highlight is not its property.
    act(() => { useStore.getState().clearSearchHits(); });
    expect(useStore.getState().searchHits.hits).toEqual([]);
    expect(navHits()).toHaveLength(1);
    expect(navHits()[0].location.segments).toHaveLength(2);
  });

  it('the NEXT single-range jump clears the previous wrap highlight — no ghost bands', () => {
    // Two jumps into the same molecule: first the origin-crossing locus, then an internal one. If the
    // first highlight survived, the biologist would see bands at the origin while standing on a locus
    // in the middle — two «hits» where the search found one.
    const doc = entry('w', RING, 'circular');
    const wrap = engineOccurrence(WRAP_QUERY, doc);
    const inner = engineOccurrence('TGTGTGTG', doc);
    expect(inner.location.segments).toHaveLength(1);
    mountInspector(doc);

    openEntryFor(doc, wrap);
    expect(navHits()).toHaveLength(1);

    openEntryFor(doc, inner);
    expect(seqTabProps.current.caretAnchor).toBe(inner.location.segments[0].start);
    expect(navHits()).toEqual([]);
  });

  it('a single-range PALINDROME keeps both strands — `both` is not silently a plus', () => {
    // The selection can only be drawn on one strand, so a `both` locus is NOT expressible by the
    // caret either — even though it is one contiguous range. Sending it to the selection alone paints
    // the top strand and hides the bottom one, which is the same loss of `both` fixed in the popover.
    const doc = entry('p', `AAA${'GGAATTCC'}TTT`, 'linear');
    const occ = engineOccurrence('GGAATTCC', doc);
    expect(occ.location.strand).toBe('both');
    expect(occ.location.segments).toHaveLength(1);

    mountInspector(doc);
    openEntryFor(doc, occ);

    const hits = navHits();
    expect(hits).toHaveLength(1);
    expect(hits[0].location.strand).toBe('both');
    expect(hits[0].location.segments).toEqual([{ start: 3, end: 11 }]);
  });

  it('a locus found on version 1 is NOT applied after the molecule is saved as version 2', () => {
    // The real staleness, on the real field. The search ran, the biologist saved an edit, then
    // clicked the row. Those coordinates describe bases that have moved; applying them would put the
    // caret on the wrong ones with no sign that anything is off.
    const searched = entry('w', RING, 'circular', 1);
    const occ = engineOccurrence(WRAP_QUERY, searched);
    const savedAgain = entry('w', RING, 'circular', 2);
    mountInspector(savedAgain);
    openEntryFor(searched, occ, savedAgain);

    expect(seqTabProps.current.caretPos).toBeNull();
    expect(navHits()).toEqual([]);
    expect(useStore.getState().navRequest).toBeNull(); // acked, not left pending
  });

  it('a TRANSIENT edit is a different document — the saved locus is not applied to the buffer', () => {
    // The viewer is showing an unsaved buffer with an insertion in it. The result was computed on
    // the saved sequence, so every coordinate after the insertion is off by one.
    const doc = entry('w', RING, 'circular', 1);
    const occ = engineOccurrence(WRAP_QUERY, doc);
    mountInspector(doc, { edits: { editedSequence: `A${RING}`, editLog: [{ op: 'insert' }] } });
    openEntryFor(doc, occ);

    expect(seqTabProps.current.caretPos).toBeNull();
    expect(navHits()).toEqual([]);
  });

  it('an edit made AFTER a wrap jump clears the bands it left behind', () => {
    const doc = entry('w', RING, 'circular', 1);
    const occ = engineOccurrence(WRAP_QUERY, doc);
    const { rerender } = mountInspector(doc);
    openEntryFor(doc, occ);
    expect(navHits()).toHaveLength(1); // both segments painted

    // …the biologist inserts a base. The old bands describe positions that have shifted.
    act(() => {
      rerender(
        <SingleInspector
          item={doc}
          flags={{ autoAnnotate: false }}
          edits={{ editedSequence: `A${RING}`, editLog: [{ op: 'insert' }] }}
          activeTab="sequence"
          onActiveTabChange={() => {}}
          onUpdateFlags={() => {}}
          onUpdateEdits={() => {}}
          onAppendAdded={() => {}}
          onRenameItem={() => {}}
        />,
      );
    });
    expect(navHits()).toEqual([]);
  });

  it('a jump from the ANNOTATIONS tab moves the user to Sequence, where the highlight lives', () => {
    // `searchHits` / the overlay are read by SequenceTab only. Leaving the user on Annotations scrolls
    // an editor that cannot show the locus, and the wrap segments stay in a hidden tab.
    const doc = entry('w', RING, 'circular');
    const occ = engineOccurrence(WRAP_QUERY, doc);
    const { onActiveTabChange } = mountInspector(doc, { activeTab: 'annotations' });
    openEntryFor(doc, occ);

    expect(onActiveTabChange).toHaveBeenCalledWith('sequence');
  });
});

// ── U5-B · a saved change that `version` cannot see still invalidates the jump ────────────────────
describe('U5-B — the jump is checked against the DOCUMENT, not just the version', () => {
  /** Age the molecule the way a saved topology flip or an annotation edit does. */
  const ageEntry = (id, g) => act(() => {
    useStore.setState((s) => { s.entryGenerations = { ...s.entryGenerations, [id]: g }; });
  });

  it('a saved TOPOLOGY flip between result and click rejects the old wrap locus', () => {
    // circular → linear removes the origin-crossing locus entirely: on a line there is no way round.
    // `version` is untouched by that write, so it alone would have let the jump through.
    const doc = entry('w', RING, 'circular');
    ageEntry('w', 3);
    const occ = engineOccurrence(WRAP_QUERY, doc);
    const searchedRef = entryToDocument(doc, { generation: 3 }).ref;

    ageEntry('w', 4); // the flip lands
    const nowLinear = entry('w', RING, 'linear');
    mountInspector(nowLinear);
    const action = resolveSearchPick(searchedRef, occ);
    const openEntry = makeOpenEntry({
      getEntry: () => nowLinear,
      guardedSelect: () => true,
      setView: () => {}, setSelectedId: () => {}, initPerEntryState: () => {},
      requestSequenceNav: (id, target) => useStore.getState().requestSequenceNav(id, target),
    });
    act(() => { openEntry(action.id, action.occurrence, action.revision, action.docEpoch); });

    expect(seqTabProps.current.caretPos).toBeNull();
    expect(navHits()).toEqual([]);
    expect(useStore.getState().navRequest).toBeNull(); // acked, not left pending
  });

  it('a saved ANNOTATION edit between result and click rejects the old locus too', () => {
    const doc = entry('m', LINEAR, 'linear');
    ageEntry('m', 1);
    const occ = engineOccurrence(RC, doc);
    const searchedRef = entryToDocument(doc, { generation: 1 }).ref;

    ageEntry('m', 2); // features rewritten — same bases, different document
    mountInspector(doc);
    const action = resolveSearchPick(searchedRef, occ);
    const openEntry = makeOpenEntry({
      getEntry: () => doc,
      guardedSelect: () => true,
      setView: () => {}, setSelectedId: () => {}, initPerEntryState: () => {},
      requestSequenceNav: (id, target) => useStore.getState().requestSequenceNav(id, target),
    });
    act(() => { openEntry(action.id, action.occurrence, action.revision, action.docEpoch); });

    expect(seqTabProps.current.caretPos).toBeNull();
    expect(navHits()).toEqual([]);
  });

  it('…and the SAME document still opens — the guard refuses staleness, not everything', () => {
    const doc = entry('m', LINEAR, 'linear');
    ageEntry('m', 5);
    const occ = engineOccurrence(RC, doc);
    mountInspector(doc);
    openEntryFor(doc, occ);
    expect(seqTabProps.current.caretAnchor).toBe(3);
    expect(seqTabProps.current.caretPos).toBe(15);
  });
});
