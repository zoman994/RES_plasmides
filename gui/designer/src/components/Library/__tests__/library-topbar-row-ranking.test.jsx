/**
 * U5.2 RED — the dropdown must rank molecules by IDENTITY, and open the locus it ranked by.
 *
 * Deliberately driven through the whole production chain — store → LibrarySmartSearchBar → the real
 * search facade and worker path → rendered rows → a click — rather than by calling `rankSearchRows`
 * directly. The pure ranker is already proven by unit tests; what is NOT proven is that the live bar
 * uses it, and a wiring attempt that looked obviously correct once emptied the dropdown entirely.
 * Only the real shape of a `SearchSession` can show that.
 *
 * The defect this pins: the session is ordered by `relevanceKey` = [dimension, relation,
 * title.toLowerCase()]. Both molecules below match on the SAME dimension with the SAME relation, so
 * the tie falls to the title — and the stronger hit sorts below the weaker one purely because its
 * name starts with «z». For a biologist scanning the first row that is a wrong answer, not a
 * cosmetic one.
 *
 * THE LADDER IS 95 % vs 85 %, NOT 100 % vs 85 % (U6-E1, corrected in U7). Exact-first is a rule
 * about the LIBRARY: if the exact phase finds anything anywhere, the reply is those hits and an
 * approximate row is never mixed in beside a confirmed one. So the two identities in a single list
 * can only both be approximate. The 100 % case did not disappear — it is asserted separately below,
 * as the EXCLUSION it actually is.
 *
 * The click assertion is part of the same contract on purpose: a row that is ranked by one locus and
 * opens another would be just as wrong, and the two can only be checked together. It keeps the exact
 * corpus, so the locus it hands over is the exact one.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

// 20 nt — long enough that the adaptive threshold is the ≥80 % band, so an 85 % hit is a RESULT
// and not a filtered-out candidate.
const QUERY = 'GAATTCACGTACGGTACCTT';

/** Flip `positions` to a base that is certainly different — exactly N substitutions, no indels. */
const mutate = (s, positions) => positions.reduce(
  (acc, i) => acc.slice(0, i) + (acc[i] === 'A' ? 'C' : 'A') + acc.slice(i + 1),
  s,
);
const WEAK_MOTIF = mutate(QUERY, [3, 9, 15]); // 17/20 matched → 85 %
const NEAR_MOTIF = mutate(QUERY, [11]); //       19/20 matched → 95 %

const STRONG_SEQ = `AAAA${QUERY}TTTT`;
const WEAK_SEQ = `AAAA${WEAK_MOTIF}TTTT`;
const NEAR_SEQ = `AAAA${NEAR_MOTIF}TTTT`;

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

function seed(id, name, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [],
      payload: { sequence, length: sequence.length, topology: 'linear', annotations: [] },
    };
  });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
  // Names chosen so the OLD order (title) and the CORRECT order (identity) disagree.
  seed('weak', 'aaa-weak-plasmid', WEAK_SEQ);
  seed('strong', 'zzz-strong-plasmid', STRONG_SEQ);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('U5.2 — the dropdown ranks by identity and opens what it ranked', () => {
  // U6-E1 CHANGED THE CORPUS THIS CASE CAN USE, and not by accident. Exact-first is a rule about the
  // LIBRARY: the exact phase sweeps every document, and if it finds anything the reply IS those hits
  // — an approximate match is never mixed in beside a confirmed one. So a list holding 100 % AND 85 %
  // cannot occur on the shipping route, and this case used to demand exactly that (it seeded an exact
  // molecule and then asserted the 85 % one was rendered too).
  //
  // The QUESTION it was written to ask is untouched and is asked here in full: when two molecules
  // both match, the stronger one leads even though its name sorts last. It is asked on an
  // approximate ladder (95 % vs 85 %), because that is where two identities can coexist at all. The
  // exact case keeps its own test below, where it now also pins the exclusion itself.
  it('the stronger molecule is the FIRST row even though its name sorts last', async () => {
    useStore.setState((s) => { s.libraryEntries = {}; });
    seed('weak', 'aaa-weak-plasmid', WEAK_SEQ); //  85 %
    seed('strong', 'zzz-strong-plasmid', NEAR_SEQ); // 95 % — no exact hit anywhere in this corpus
    vi.useFakeTimers();
    renderTopBar({ query: `seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    // Both molecules genuinely matched — this is a ranking test, not a filtering one.
    expect(screen.getByTestId('smart-result-strong')).toBeTruthy();
    expect(screen.getByTestId('smart-result-weak')).toBeTruthy();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('zzz-strong-plasmid');
    expect(options[1].textContent).toContain('aaa-weak-plasmid');
  });

  it('an exact hit anywhere excludes the approximate ones — the corpus rule, not a ranking', async () => {
    // The behaviour that made the case above unaskable, pinned rather than left implicit: with the
    // exact molecule seeded, the 85 % one is not a lower row — it is not a row.
    vi.useFakeTimers();
    renderTopBar({ query: `seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    expect(screen.getByTestId('smart-result-strong')).toBeTruthy();
    expect(screen.queryByTestId('smart-result-weak')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('clicking the top row opens THAT entity, at the occurrence it was ranked by', async () => {
    vi.useFakeTimers();
    const onPickSearchResult = vi.fn();
    renderTopBar({ query: `seq:${QUERY}`, onPickSearchResult });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const options = screen.getAllByRole('option');
    act(() => { fireEvent.click(options[0]); });

    expect(onPickSearchResult).toHaveBeenCalledTimes(1);
    const [ref, occurrence] = onPickSearchResult.mock.calls[0];
    expect(ref).toMatchObject({ kind: 'entry', id: 'strong' });

    // …and the locus handed over is the one that earned the row its place: the exact hit, whose
    // coordinates are the QUERY's own position in the molecule (4 leading A's).
    expect(occurrence).toBeTruthy();
    expect(occurrence.metrics.identityBps).toBe(10000);
    expect(occurrence.location.segments[0]).toEqual({ start: 4, end: 4 + QUERY.length });
  });
});
