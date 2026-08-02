/**
 * P1-1 RED — when the biologist asks a BIOLOGICAL question, the biological answer owns the locus.
 *
 * A mixed query names a feature AND asks a provider: `ampR aa:HHHHHH`, `lacZalpha re:EcoRI`. Both
 * dimensions produce occurrences with real coordinates, so `rankSearchRows` — which pooled every
 * dimension into one list — had to break the tie by something. It could not break it by identity:
 * `protein-match` and `re-match` build SeqMetrics-shaped metrics WITHOUT `alignmentLength`, so the
 * §3.2 comparator calls them unscored, exactly like a feature span. Unscored vs unscored is a tie,
 * and `pickBestOccurrence` keeps the earlier element — which is the FEATURE, because the metadata
 * dimensions are filled by `matchTerm` before the providers are injected.
 *
 * The consequence is not cosmetic. The biologist asked where the His-tag is, or where EcoRI cuts,
 * and the row hands over the ampR/lacZ span instead: the click lands hundreds of bases away from the
 * thing that was asked about, and the location count treats the feature as if it were one more site.
 *
 * Contract pinned here: a biological provider dimension (sequence / protein / enzyme) OWNS `best`
 * and the location count. A feature span is a fallback, and only when no provider answered at all —
 * a pure `ampR` query must still open the feature, which the last test holds down.
 *
 * Driven through the production chain (store → LibraryTopBar → real facade → rendered row → click),
 * never by calling `rankSearchRows` directly: what is in doubt is the live wiring, not the ranker.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

// ── Fixture A · protein ──────────────────────────────────────────────────────────────────────
// 40 nt of filler, then a CDS translating to M K H H H H H H R *. `ACGT`-filler contains no CAT,
// so the only His codons are the tag's.
const A_HEAD = 'ACGT'.repeat(10); //                                   [0,40)
const A_CDS = `ATGAAA${'CAT'.repeat(6)}CGTTAA`; //                      [40,70) — 30 nt
const A_SEQ = `${A_HEAD}${A_CDS}${'T'.repeat(20)}`; //                  90 nt
const A_CDS_SPAN = { start: 40, end: 70 }; //                           what the FEATURE dimension offers
const A_TAG_SPAN = { start: 46, end: 64 }; //                           residues 2..7 → 6 His codons

// ── Fixture B · enzyme ───────────────────────────────────────────────────────────────────────
// `AC`-filler can never spell GAATTC, so the palindromic EcoRI site occurs exactly once.
const B_SEQ = `${'AC'.repeat(40)}GAATTC${'AC'.repeat(7)}`; //           100 nt
const B_FEAT_SPAN = { start: 0, end: 60 }; //                          what the FEATURE dimension offers
const B_SITE_SPAN = { start: 80, end: 86 }; //                         the recognition site

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

function seed(id, name, sequence, annotations, topology = 'linear') {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [],
      payload: { sequence, length: sequence.length, topology, annotations },
    };
  });
}

/** The molecule's NAME never matches the query term — so the only metadata hit is the feature. */
const seedProteinFixture = () => seed('his', 'pBG-fusion', A_SEQ, [
  { id: 'cds1', level: 'region', type: 'CDS', name: 'ampR', start: 40, end: 70, strand: 1 },
]);
const seedEnzymeFixture = () => seed('cut', 'pBG-vector', B_SEQ, [
  { id: 'f1', level: 'region', type: 'CDS', name: 'lacZalpha', start: 0, end: 60, strand: 1 },
]);

async function open(query, extra) {
  vi.useFakeTimers();
  const utils = renderTopBar({ query, ...extra });
  act(() => { vi.advanceTimersByTime(200); });
  await flush();
  await flush();
  return utils;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('P1-1 — a biological provider owns the locus the row opens', () => {
  it('sanity: the fixtures really carry both a feature span and a provider hit', () => {
    expect(A_SEQ.slice(A_CDS_SPAN.start, A_CDS_SPAN.end)).toBe(A_CDS);
    expect(A_SEQ.slice(A_TAG_SPAN.start, A_TAG_SPAN.end)).toBe('CAT'.repeat(6));
    expect(B_SEQ.indexOf('GAATTC')).toBe(B_SITE_SPAN.start);
    expect(B_SEQ.lastIndexOf('GAATTC')).toBe(B_SITE_SPAN.start); // exactly one site
  });

  it('`ampR aa:HHHHHH` opens the His-TAG, not the whole ampR CDS', async () => {
    const onPickSearchResult = vi.fn();
    seedProteinFixture();
    await open('ampR aa:HHHHHH', { onPickSearchResult });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    act(() => { fireEvent.click(options[0]); });

    const [ref, occurrence] = onPickSearchResult.mock.calls[0];
    expect(ref).toMatchObject({ kind: 'entry', id: 'his' });
    // The defect answers `A_CDS_SPAN` — the feature the term matched, which is the question the
    // biologist did NOT ask. The tag is 6 nt away and 18 nt long.
    expect(occurrence.location.segments[0]).toEqual(A_TAG_SPAN);
    expect(occurrence.protein).toBeTruthy(); // it is literally the protein dimension's occurrence
  });

  it('`ampR aa:HHHHHH` counts ONE place on the DNA — the CDS span is not a second one', async () => {
    seedProteinFixture();
    await open('ampR aa:HHHHHH');

    const shown = screen.getByTestId('smart-result-his-locations').textContent;
    expect(shown.match(/\d+/g)).toEqual(['1']);
  });

  it('`lacZalpha re:EcoRI` opens the CUT SITE, not the lacZ feature', async () => {
    const onPickSearchResult = vi.fn();
    seedEnzymeFixture();
    await open('lacZalpha re:EcoRI', { onPickSearchResult });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    act(() => { fireEvent.click(options[0]); });

    const [ref, occurrence] = onPickSearchResult.mock.calls[0];
    expect(ref).toMatchObject({ kind: 'entry', id: 'cut' });
    expect(occurrence.location.segments[0]).toEqual(B_SITE_SPAN);
    expect(occurrence.enzyme).toMatchObject({ name: 'EcoRI' });
  });

  it('`lacZalpha re:EcoRI` counts ONE site — the feature span is not a cut', async () => {
    seedEnzymeFixture();
    await open('lacZalpha re:EcoRI');

    const shown = screen.getByTestId('smart-result-cut-locations').textContent;
    expect(shown.match(/\d+/g)).toEqual(['1']);
  });

  it('WITHOUT a provider the feature still owns the locus — fallback, not removal', async () => {
    const onPickSearchResult = vi.fn();
    seedEnzymeFixture();
    await open('lacZalpha', { onPickSearchResult });

    // Read the count BEFORE the click: picking a row closes the dropdown, so the row is gone.
    const shown = screen.getByTestId('smart-result-cut-locations').textContent;
    expect(shown.match(/\d+/g)).toEqual(['1']);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    act(() => { fireEvent.click(options[0]); });

    const [, occurrence] = onPickSearchResult.mock.calls[0];
    // Nobody biological answered, so the feature IS the best place on the molecule — a plain
    // `lacZalpha` query must still take the biologist to lacZ.
    expect(occurrence.location.segments[0]).toEqual(B_FEAT_SPAN);
  });
});
