/**
 * U5-B — the search corpus ages exactly once per real change, and never for merely looking.
 *
 * Two failures this pins, both found by review rather than by the app falling over:
 *   • the watcher started from `null`, so the FIRST mutation of a session was only recorded, never
 *     counted. A frame captured at generation 0 outlived the first import or rename, and Back would
 *     have replayed rows from before it as if they were current.
 *   • opening a molecule ran the annotation safety-net, which wrote unconditionally. The entry
 *     object was replaced, the watcher read that as «the library changed», and the corpus aged for
 *     a navigation that changed nothing — so the «no new work» half of Back could never happen.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';
import { registerSearchCorpusWatcher } from '../searchSessionSlice';
import { savedDocEpoch } from '../../lib/search-document-adapters';

const gen = () => useStore.getState().searchCorpusGeneration;
const entryGen = (id) => useStore.getState().entryGenerations?.[id];

const ENTRY = (id, over = {}) => ({
  id, kind: 'container', name: id, tags: [], version: 1, zone: 'loose', projectId: null,
  payload: { sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations: [] },
  ...over,
});

beforeEach(() => {
  useStore.setState((s) => {
    s.libraryEntries = {}; s.projects = {}; s.primersById = {};
    s.searchCorpusGeneration = 0; s.entryGenerations = {};
  });
});

describe('searchCorpusGeneration — the watcher matrix', () => {
  it('the FIRST corpus mutation of a FRESH watcher counts', () => {
    // Against the app store this cannot be observed: the suite's own setup already wrote to it, so
    // any watcher is warm by the time a test runs — which is exactly why the unseeded version passed
    // review. A watcher registered here, over a stub store, is the only place the first change IS
    // the first change.
    let listener = null;
    let bumps = 0;
    let entryBumps = 0;
    const state = {
      libraryEntries: { a: ENTRY('a') },
      projects: {},
      primersById: {},
      bumpSearchCorpus: () => { bumps += 1; },
      bumpChangedEntries: () => { entryBumps += 1; },
    };
    const stub = {
      getState: () => state,
      subscribe: (fn) => { listener = fn; return () => { listener = null; }; },
    };
    registerSearchCorpusWatcher(stub);

    // The very first mutation after registration: a molecule arrives.
    state.libraryEntries = { ...state.libraryEntries, b: ENTRY('b') };
    listener(state);
    expect(bumps).toBe(1);
    expect(entryBumps).toBe(1);

    // …and a notification that changes none of the three maps still counts for nothing.
    listener(state);
    expect(bumps).toBe(1);
  });

  it('all three corpus maps age it — entries, projects, primers', () => {
    const g0 = gen();
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const g1 = gen();
    expect(g1).toBeGreaterThan(g0);
    useStore.setState((s) => { s.projects = { ...s.projects, p1: { id: 'p1', name: 'Project' } }; });
    const g2 = gen();
    expect(g2).toBeGreaterThan(g1);
    useStore.setState((s) => { s.primersById = { ...s.primersById, pr1: { id: 'pr1', name: 'oligo' } }; });
    expect(gen()).toBeGreaterThan(g2);
  });

  it('a SOFT-delete ages it — the row leaves the results even though the record stays', () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const before = gen();
    useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, _pendingDelete: true }; });
    expect(gen()).toBe(before + 1);
  });

  it('metadata that is searchable ages it — a rename, a retag, a status change', () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    let before = gen();
    useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, name: 'renamed' }; });
    expect(gen()).toBe(before + 1);
    before = gen();
    useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, tags: ['kanamycin'] }; });
    expect(gen()).toBe(before + 1);
    before = gen();
    useStore.setState((s) => {
      s.libraryEntries.a = { ...s.libraryEntries.a, origin: { status: 'release' } };
    });
    expect(gen()).toBe(before + 1);
  });

  it('a NON-corpus update leaves it alone — the corpus is not «every store write»', () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const before = gen();
    useStore.setState((s) => { s.theme = s.theme === 'dark' ? 'light' : 'dark'; });
    useStore.getState().showToast?.('hello', 'info');
    useStore.setState((s) => { s.modals = { ...s.modals, settings: true }; });
    expect(gen()).toBe(before);
  });
});

describe('entryGenerations — the age of ONE molecule', () => {
  it('ages only the entries whose object actually moved', () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); s.libraryEntries.b = ENTRY('b'); });
    const aBefore = entryGen('a');
    const bBefore = entryGen('b');
    useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, name: 'only-a' }; });
    expect(entryGen('a')).toBe(aBefore + 1);
    expect(entryGen('b')).toBe(bBefore); // untouched molecule keeps its age
  });

  it('a saved TOPOLOGY flip and an ANNOTATION edit both age it — `version` sees neither', () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const v0 = useStore.getState().libraryEntries.a.version;
    let before = entryGen('a');
    useStore.setState((s) => {
      s.libraryEntries.a = { ...s.libraryEntries.a, payload: { ...s.libraryEntries.a.payload, topology: 'circular' } };
    });
    expect(entryGen('a')).toBe(before + 1);
    before = entryGen('a');
    useStore.setState((s) => {
      s.libraryEntries.a = {
        ...s.libraryEntries.a,
        payload: { ...s.libraryEntries.a.payload, annotations: [{ id: 'f1', type: 'CDS', start: 0, end: 9 }] },
      };
    });
    expect(entryGen('a')).toBe(before + 1);
    // …and the version never moved, which is exactly why it could not carry this guard alone.
    expect(useStore.getState().libraryEntries.a.version).toBe(v0);
  });

  it('a deleted molecule leaves a TOMBSTONE — a reused id can never wear its predecessor\'s epoch', () => {
    // The failure this pins: dropping the age on delete restarts a re-used id at 1. A result parked
    // against the FORMER occupant of that id carries `v1#g1`; the newcomer, saved once and aged once,
    // presents `v1#g1` as well — and a locus from a different molecule entirely is applied without a
    // word. Ids are reused in practice: a re-imported .bodge and a restored backup both do it.
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const asFirstOccupant = entryGen('a');
    expect(asFirstOccupant).toBeGreaterThan(0);

    useStore.setState((s) => { const next = { ...s.libraryEntries }; delete next.a; s.libraryEntries = next; });
    expect(entryGen('a'), 'the age survives the molecule').toBeGreaterThan(asFirstOccupant);

    // A DIFFERENT document arrives under the same id, at the same version.
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a', { name: 'a different molecule' }); });
    expect(entryGen('a'), 'the newcomer starts above every epoch the old one ever had')
      .toBeGreaterThan(asFirstOccupant);
    expect(savedDocEpoch(useStore.getState().libraryEntries.a, entryGen('a')))
      .not.toBe(savedDocEpoch(ENTRY('a'), asFirstOccupant));
  });
});

describe('an annotation edit is never silently dropped', () => {
  const CDS = {
    id: 'f1', level: 'region', type: 'CDS', name: 'glaA', start: 0, end: 9, strand: 1,
    qualifiers: { product: 'glucoamylase', gene: 'glaA' },
  };
  const withAnns = (anns) => ENTRY('a', {
    payload: { sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations: anns },
  });

  it('a qualifier-only edit reaches the store AND ages the corpus', async () => {
    // The no-op guard compared a fixed list of fields, so this edit compared «equal» and the write was
    // cancelled: not in the store, not in Dexie, no error. Data loss wearing an optimisation's clothes.
    useStore.setState((s) => { s.libraryEntries.a = withAnns([CDS]); });
    const corpusBefore = gen();
    const entryBefore = entryGen('a');

    const edited = [{ ...CDS, qualifiers: { ...CDS.qualifiers, product: 'glucoamylase precursor' } }];
    await useStore.getState().writeLibraryEntryAnnotations('a', edited);

    expect(useStore.getState().libraryEntries.a.payload.annotations[0].qualifiers.product)
      .toBe('glucoamylase precursor');
    expect(gen(), 'the corpus knows the molecule changed').toBeGreaterThan(corpusBefore);
    expect(entryGen('a')).toBeGreaterThan(entryBefore);
  });

  it('another real field — a colour — survives the same path', async () => {
    useStore.setState((s) => { s.libraryEntries.a = withAnns([CDS]); });
    await useStore.getState().writeLibraryEntryAnnotations('a', [{ ...CDS, color: '#c8102e' }]);
    expect(useStore.getState().libraryEntries.a.payload.annotations[0].color).toBe('#c8102e');
  });

  it('…and the annotation contract still holds on what was written', async () => {
    useStore.setState((s) => { s.libraryEntries.a = withAnns([CDS]); });
    await useStore.getState().writeLibraryEntryAnnotations('a', [{ ...CDS, qualifiers: { product: 'x' } }]);
    const [a] = useStore.getState().libraryEntries.a.payload.annotations;
    expect(typeof a.id, 'every annotation carries a string id').toBe('string');
    expect(a.start, '0-based start is preserved verbatim').toBe(0);
    expect(a.end, 'end stays EXCLUSIVE — never nudged by a round-trip').toBe(9);
  });
});

describe('the annotation safety-net does not age the corpus for a no-op', () => {
  it('rewriting the SAME annotations changes nothing', async () => {
    const anns = [{ id: 'f1', type: 'CDS', name: 'gene', start: 0, end: 9, strand: 1 }];
    useStore.setState((s) => {
      s.libraryEntries.a = ENTRY('a', { payload: { sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations: anns } });
    });
    const corpusBefore = gen();
    const entryBefore = entryGen('a');

    // What the inspector does on every open: hand the same list back to the safety-net.
    await useStore.getState().writeLibraryEntryAnnotations('a', anns.map((x) => ({ ...x })));

    expect(gen()).toBe(corpusBefore);
    expect(entryGen('a')).toBe(entryBefore);
  });

  it('…but a REAL annotation change still writes and ages', async () => {
    useStore.setState((s) => { s.libraryEntries.a = ENTRY('a'); });
    const corpusBefore = gen();
    await useStore.getState().writeLibraryEntryAnnotations('a', [{ id: 'f1', type: 'CDS', start: 0, end: 9 }]);
    expect(gen()).toBeGreaterThan(corpusBefore);
  });
});
