/**
 * U5.2b RED — the row, the click and Enter must all use LITERALLY the ranked occurrence.
 *
 * `rankSearchRows` decides which locus a molecule is ranked by, using the molecule's effective
 * topology. The view model then used to decide again, from the same occurrences but WITHOUT that
 * topology — so on a circle the two could legitimately disagree, and the row would be sorted by one
 * locus while opening another. The biologist gets taken to a place the ranking never meant.
 *
 * The case that separates them is exact and normative: a circular molecule with two equally good
 * hits, one internal and one ending EXACTLY at the origin. §3.2.1 takes the endpoint modulo the
 * molecule, so the origin-ending hit ends at 0 and wins rule 6. Reading the raw segment end — all a
 * meta-less picker can do — makes it end at `n` and lose. One fixture, two different answers.
 *
 * Second contract here: «N локаций» counts PHYSICAL loci. A metadata match (a name hit) carries no
 * coordinates, so counting it would tell a biologist there is one more place on the DNA than exists.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

const QUERY = 'GAATTCACGTAC';          // 12 nt, exact in both loci
const N = 300;
const HEAD = 'A'.repeat(100);          // no accidental hit, forward or reverse-complement
const MID = 'A'.repeat(N - 100 - QUERY.length * 2);
// [100,112) internal · [288,300) ends exactly AT the origin
const RING_SEQ = `${HEAD}${QUERY}${MID}${QUERY}`;

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

/**
 * The locus card belongs to the ACTIVE row (§5.3.1): the main line carries the name and the identity
 * percentage, the supporting numbers appear once the row is focused or pointed at. So a test that
 * wants to read strand / coordinates / X·I·D has to make a row active first — exactly as a biologist
 * does. `ArrowDown` is the keyboard half of that one state; `mouseEnter` is the pointer half.
 */
const focusFirstRow = () => {
  const input = screen.getByTestId('library-topbar-search-input');
  act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }); });
  return input;
};

function seed(id, name, sequence, topology) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [],
      payload: { sequence, length: sequence.length, topology, annotations: [] },
    };
  });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('U5.2b — the ranked locus is the one the row opens', () => {
  it('sanity: the fixture really has both loci, and the ring ends exactly at the origin', () => {
    expect(RING_SEQ).toHaveLength(N);
    expect(RING_SEQ.indexOf(QUERY)).toBe(100);
    expect(RING_SEQ.lastIndexOf(QUERY)).toBe(N - QUERY.length); // 288 → ends at 300 ≡ 0
  });

  it('CLICK opens the locus the ranking chose — the origin-ending one, not the internal one', async () => {
    vi.useFakeTimers();
    const onPickSearchResult = vi.fn();
    seed('ring', 'ring-plasmid', RING_SEQ, 'circular');
    renderTopBar({ query: `seq:${QUERY}`, onPickSearchResult });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    act(() => { fireEvent.click(options[0]); });

    const [, occurrence] = onPickSearchResult.mock.calls[0];
    // On a circle §3.2.1 normalises the endpoint: 300 mod 300 = 0, which beats the internal 112.
    // A picker that reads the raw segment end answers [100,112) instead — that is the whole defect.
    expect(occurrence.location.segments[0]).toEqual({ start: N - QUERY.length, end: N });
  });

  it('ENTER opens the SAME locus as the click — one decision, two input paths', async () => {
    vi.useFakeTimers();
    const onPickSearchResult = vi.fn();
    seed('ring', 'ring-plasmid', RING_SEQ, 'circular');
    renderTopBar({ query: `seq:${QUERY}`, onPickSearchResult });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const input = screen.getByTestId('library-topbar-search-input');
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }); });
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });

    expect(onPickSearchResult).toHaveBeenCalledTimes(1);
    const [, occurrence] = onPickSearchResult.mock.calls[0];
    expect(occurrence.location.segments[0]).toEqual({ start: N - QUERY.length, end: N });
  });

  it('«N локаций» counts PHYSICAL loci only — a name match is not a place on the DNA', async () => {
    vi.useFakeTimers();
    // The molecule matches BOTH by name and by sequence: `pUC` hits the name, the motif hits twice.
    seed('puc', 'pUC-ring', RING_SEQ, 'circular');
    renderTopBar({ query: `pUC seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    // Two DNA loci — no more, no less. Counting the name occurrence would claim a third place.
    // Asserted as an exact number, not `toContain('2')`: that would pass just as happily for 12 or 20.
    focusFirstRow();
    const shown = screen.getByTestId('smart-result-puc-locations').textContent;
    expect(shown.match(/\d+/g)).toEqual(['2']);
  });

  // ── U5-A · the row states the locus, and states it once ────────────────────────────────────
  it('a MINUS-strand hit reads «−», and click hands over that same minus occurrence', async () => {
    vi.useFakeTimers();
    const onPickSearchResult = vi.fn();
    // The molecule carries the motif on the PLUS strand; we search for its reverse complement, so
    // the only hit is on the minus strand. If the row said «+» the biologist would order a primer
    // for the wrong strand.
    const MOTIF = 'GAATTCACGTAA';
    const RC = 'TTACGTGAATTC'; // reverse complement of MOTIF
    seed('m', 'minus-plasmid', `AAA${MOTIF}TTT`, 'linear');
    renderTopBar({ query: `seq:${RC}`, onPickSearchResult });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    focusFirstRow();
    expect(screen.getByTestId('smart-result-m-strand').textContent).toBe('−'); // U+2212
    expect(screen.getByTestId('smart-result-m-coords').textContent).toBe('[3, 15)');

    act(() => { fireEvent.click(screen.getAllByRole('option')[0]); });
    const [, occurrence] = onPickSearchResult.mock.calls[0];
    expect(occurrence.location.strand).toBe('-');
    expect(occurrence.location.segments[0]).toEqual({ start: 3, end: 15 });
  });

  it('a WRAP shows BOTH ranges, and Enter hands over BOTH segments uncollapsed', async () => {
    vi.useFakeTimers();
    const onPickSearchResult = vi.fn();
    // The query matches only ACROSS the origin: the tail holds `AAACCC`, the head continues
    // `GATTAC`. One merged range would name a span that does not exist on the plasmid.
    const RING = `GATTAC${'TGTGTGTG'}AAACCC`; // 20 nt
    seed('w', 'wrap-plasmid', RING, 'circular');
    renderTopBar({ query: 'seq:AAACCCGATTAC', onPickSearchResult });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const input = focusFirstRow();
    expect(screen.getByTestId('smart-result-w-coords').textContent).toBe('[14, 20) + [0, 6)');

    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });
    const [, occurrence] = onPickSearchResult.mock.calls[0];
    expect(occurrence.location.segments).toEqual([{ start: 14, end: 20 }, { start: 0, end: 6 }]);
    expect(occurrence.location.wrapsOrigin).toBe(true);
  });

  it('a palindrome found on both strands reads «±»', async () => {
    vi.useFakeTimers();
    seed('p', 'pal-plasmid', 'TTTAAAGGAATTCCCCCGGG', 'linear');
    renderTopBar({ query: 'seq:GGAATTCC' }); // its own reverse complement
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();
    focusFirstRow();
    expect(screen.getByTestId('smart-result-p-strand').textContent).toBe('±');
  });

  it('the card belongs to the ACTIVE row: none idle, keyboard opens one, HOVER moves it', async () => {
    vi.useFakeTimers();
    // TWO rows, because one row cannot separate «hover works» from «keyboard already activated it».
    // Both molecules carry the same motif once, so the only thing that differs between the rows is
    // which one the user is pointing at.
    const SEQ = `${'A'.repeat(20)}${QUERY}${'A'.repeat(20)}`;
    seed('a1', 'alpha-plasmid', SEQ, 'linear');
    seed('b2', 'beta-plasmid', SEQ, 'linear');
    renderTopBar({ query: `seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const opt = (i) => screen.getAllByRole('option')[i];
    expect(screen.getAllByRole('option')).toHaveLength(2);

    // Idle — §5.3.1: the main line is the name and the identity percentage. Nothing else, on either
    // row. A list of molecules that printed every locus number at once would not be scannable.
    expect(screen.getByTestId('smart-result-a1-identity').textContent).toMatch(/^\d+\.\d{2}%$/);
    expect(screen.queryByTestId('smart-result-a1-card')).toBeNull();
    expect(screen.queryByTestId('smart-result-b2-card')).toBeNull();
    expect(screen.queryByTestId('smart-result-a1-coords')).toBeNull();
    // …and the identity is stated ONCE: the legacy metric sentence (a float rounded to a whole
    // percent, over a different denominator) is gone from a row that has a canonical locus.
    expect(screen.queryByTestId('smart-result-a1-metrics')).toBeNull();

    const cells = (id) => ['strand', 'coords', 'ml', 'xid', 'gaps']
      .map((c) => screen.queryByTestId(`smart-result-${id}-${c}`))
      .map((el) => el && el.outerHTML);

    const input = focusFirstRow(); // keyboard half of the ONE active state
    const viaFocus = cells('a1');
    expect(viaFocus.every(Boolean)).toBe(true);
    expect(screen.queryByTestId('smart-result-b2-card')).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBe(opt(0).id);

    // Pointer at the OTHER row: the card MOVES, and so does `aria-activedescendant` — what a screen
    // reader announces is the row the sighted user is pointing at, not a second, hover-only card.
    act(() => { fireEvent.mouseEnter(opt(1)); });
    expect(screen.queryByTestId('smart-result-a1-card')).toBeNull();
    expect(screen.getByTestId('smart-result-b2-card')).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBe(opt(1).id);
    expect(opt(1).getAttribute('aria-selected')).toBe('true');
    expect(opt(0).getAttribute('aria-selected')).toBe('false');

    // Pointing back reproduces the keyboard DOM exactly — ONE component, ONE view-model, so hover
    // and focus cannot quote different numbers for the same occurrence.
    act(() => { fireEvent.mouseEnter(opt(0)); });
    expect(cells('a1')).toEqual(viaFocus);
  });

  it('the row DOM carries NO alignment internals and no sequence fragment', async () => {
    vi.useFakeTimers();
    seed('ring', 'ring-plasmid', RING_SEQ, 'circular');
    renderTopBar({ query: `seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const html = screen.getByTestId('library-topbar-search-results').innerHTML;
    for (const forbidden of ['script', 'editRuns', 'mismatchPositions', 'cigar', 'CIGAR']) {
      expect(html, forbidden).not.toContain(forbidden);
    }
    // …and not a single base of the molecule: a row is a locator, never an alignment viewer.
    expect(html).not.toContain(QUERY);
    expect(html).not.toContain(RING_SEQ.slice(0, 24));
  });

  it('a row is ONE role=option with no nested button (§5.3.1)', async () => {
    vi.useFakeTimers();
    seed('ring', 'ring-plasmid', RING_SEQ, 'circular');
    renderTopBar({ query: `seq:${QUERY}` });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    await flush();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].querySelectorAll('button')).toHaveLength(0);
    expect(options[0].querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
