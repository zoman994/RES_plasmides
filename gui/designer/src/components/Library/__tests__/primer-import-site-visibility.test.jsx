/**
 * ANN-0L — imported primers must be visible where a biologist looks.
 *
 * Today an imported primer's KNOWN source binding site is invisible on both
 * maps (neither component renders primers at all), and the SequenceView locates
 * primers by scanning the template with `indexOf` — so a declared site on a
 * repetitive template multiplies into several phantom hits, while a primer with
 * no site at all silently disappears from every surface.
 *
 * These tests drive the real components.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';

import PlasmidMapV2 from '../../PlasmidMapV2';
import LinearMapV2 from '../../LinearMapV2';
import PrimerTrack from '../../SequenceView/tracks/PrimerTrack';
import PrimerPoolList from '../../PrimerPoolList';
import OverviewTab from '../inspector/tabs/OverviewTab';
import { useStore, bootstrapStore } from '../../../store';
import { buildRenderContext } from '../../../lib/primer-site-projection';

const LEN = 600;
// ANN-0M root D - the one context these direct component checks hand over.
const MAP_CTX_TOPOLOGY = 'circular';
// Deliberately repetitive: `indexOf` placement finds this stretch many times,
// while the SOURCE says the primer binds at exactly one place.
const TEMPLATE = 'ACGTACGTAC'.repeat(60).toUpperCase();
const BIND = TEMPLATE.slice(100, 118);
const TAIL = 'GGATCC';
const MAP_CTX = buildRenderContext({
  entryId: 'e1', sequence: TEMPLATE.slice(0, LEN),
  topology: MAP_CTX_TOPOLOGY, documentHash: 'h1',
});

/** A canonical record-v2 primer with one declared source site. */
function importedPrimer(over = {}) {
  return {
    id: 'pr-1',
    schemaVersion: 2,
    name: 'fwd_check',
    sequence: TAIL + BIND,
    tail: TAIL,
    bindingSequence: BIND,
    sequenceSource: 'source',
    origin: { kind: 'file_import', entryId: 'e1', sourceRecordIndex: 0 },
    sites: [{
      id: 's1',
      sourceIndex: 0,
      target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
      location: { kind: 'single', segments: [{ start: 100, end: 118 }] },
      strand: 1,
      annealedSequence: BIND,
      tail: null,
      sourceVisibility: 'shown',
      sourceForms: ['standard'],
    }],
    ...over,
  };
}

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try { useStore.setState({ primersById: {}, libraryEntries: {} }); } catch { /* */ }
});

// ── RED 4 — known source sites are drawn on all three surfaces ─────────────

describe('ANN-0L/4 — a known source site is visible on the maps', () => {
  const primers = [importedPrimer()];

  it('the circular map draws the primer site', () => {
    const { container } = render(
      <PlasmidMapV2 annotations={[]} primers={primers} totalBp={LEN} length={LEN}  renderContext={MAP_CTX} />,
    );
    expect(container.querySelectorAll('[data-testid^="primer-site"]').length)
      .toBeGreaterThan(0);
  });

  it('the linear map draws the primer site', () => {
    const { container } = render(
      <LinearMapV2 annotations={[]} primers={primers} totalBp={LEN} length={LEN}
        renderContext={MAP_CTX} />,
    );
    expect(container.querySelectorAll('[data-testid^="primer-site"]').length)
      .toBeGreaterThan(0);
  });

  it('a primer with TWO source sites draws twice, under one primer id', () => {
    const twoSites = importedPrimer({
      sites: [
        importedPrimer().sites[0],
        {
          ...importedPrimer().sites[0],
          id: 's2', sourceIndex: 1, strand: -1,
          location: { kind: 'single', segments: [{ start: 300, end: 318 }] },
        },
      ],
    });
    const { container } = render(
      <LinearMapV2 annotations={[]} primers={[twoSites]} totalBp={LEN} length={LEN}  renderContext={MAP_CTX} />,
    );
    const glyphs = container.querySelectorAll('[data-primer-id="pr-1"]');
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
  });

  it('an origin-crossing site stays ONE logical site of two segments', () => {
    const wrap = importedPrimer({
      sites: [{
        ...importedPrimer().sites[0],
        location: { kind: 'join', segments: [{ start: 590, end: 600 }, { start: 0, end: 8 }] },
      }],
    });
    const { container } = render(
      <PlasmidMapV2 annotations={[]} primers={[wrap]} totalBp={LEN} length={LEN}  renderContext={MAP_CTX} />,
    );
    // two drawn segments, one logical site key
    const keys = new Set(
      Array.from(container.querySelectorAll('[data-primer-site-key]'))
        .map((el) => el.getAttribute('data-primer-site-key')),
    );
    expect(keys.size).toBe(1);
  });
});

describe('ANN-0L/4 — SequenceView uses the SOURCE site, not indexOf', () => {
  it('a declared single site is not multiplied by a repetitive template', () => {
    const { container } = render(
      <PrimerTrack
        entryId="e1"
        documentHash="h1"
        topology="circular"
        primers={[importedPrimer()]}
        fullSeq={TEMPLATE}
        lineStart={0}
        lineLen={LEN}
        charPx={2}
        labelChars={0}
      />,
    );
    const hits = container.querySelectorAll('[data-primer-id="pr-1"]');
    // exactly the one place the file says it binds
    expect(hits.length).toBe(1);
  });

  it('the 5-prime tail is shown apart from the genomic span', () => {
    const { container } = render(
      <PrimerTrack
        entryId="e1"
        documentHash="h1"
        topology="circular"
        primers={[importedPrimer()]}
        fullSeq={TEMPLATE}
        lineStart={0}
        lineLen={LEN}
        charPx={2}
        labelChars={0}
      />,
    );
    expect(container.querySelector('[data-primer-tail="true"]')).toBeTruthy();
  });
});

// ── RED 5 — a site-less record is a full row, and delete is exact ──────────

describe('ANN-0L/5 — a primer with no site is still a row', () => {
  async function seed(rows) {
    await act(async () => {
      useStore.setState((s) => {
        s.primersById = {};
        for (const r of rows) s.primersById[r.id] = r;
        s._primersHydrated = true;
      });
    });
  }

  it('a record with no site and no known sequence appears in the pool list', async () => {
    await seed([importedPrimer({
      id: 'orphan', name: 'orphan_oligo', sequence: null,
      tail: null, bindingSequence: null, sites: [],
    })]);
    render(<PrimerPoolList />);
    await waitFor(() => expect(screen.getByTestId('primer-pool-list')).toBeTruthy());
    expect(screen.getByText(/orphan_oligo/)).toBeTruthy();
  });

  it('that record draws NO glyph on the map', () => {
    const orphan = importedPrimer({
      id: 'orphan', sequence: null, tail: null, bindingSequence: null, sites: [],
    });
    const { container } = render(
      <LinearMapV2 annotations={[]} primers={[orphan]} totalBp={LEN} length={LEN}  renderContext={MAP_CTX} />,
    );
    expect(container.querySelectorAll('[data-primer-id="orphan"]').length).toBe(0);
  });

  it('two records sharing a sequence are two rows, and delete removes exactly one', async () => {
    await seed([
      importedPrimer({ id: 'a', name: 'orderA' }),
      importedPrimer({ id: 'b', name: 'orderB' }),
    ]);
    render(<PrimerPoolList />);
    await waitFor(() => expect(screen.getByTestId('primer-pool-list')).toBeTruthy());

    expect(screen.getByText(/orderA/)).toBeTruthy();
    expect(screen.getByText(/orderB/)).toBeTruthy();

    await act(async () => {
      await useStore.getState().removePrimerFromPool('a');
    });
    const ids = Object.keys(useStore.getState().primersById);
    expect(ids).toEqual(['b']);
  });
});


// ===========================================================================
// ANN-0L CORRECTION - the real hosts and the real store.
// ===========================================================================

// -- C1 / RED 2: provenance survives the real primerSlice -------------------
describe('ANN-0L C1 - two source records keep their own provenance', () => {
  it('a sequence-less record reaches the pool and keeps its packet index', async () => {
    const records = [
      {
        id: 'p-a', schemaVersion: 2, name: 'inventory-only',
        sequence: null, sequenceSource: 'unknown', sites: [],
        origin: {
          kind: 'file_import', format: 'snapgene', entryId: 'e1',
          sourceFileName: 'a.dna', sourceRecordIndex: 0,
        },
      },
      {
        id: 'p-b', schemaVersion: 2, name: 'has-oligo',
        sequence: 'ACGTACGTACGT', sequenceSource: 'source', sites: [],
        origin: {
          kind: 'file_import', format: 'snapgene', entryId: 'e1',
          sourceFileName: 'a.dna', sourceRecordIndex: 1,
        },
      },
    ];
    for (const r of records) {
      await useStore.getState().addPrimerToPool({
        primer: r,
        projectId: null,
        // store context must SUPPLEMENT the record's own provenance, never
        // replace where the record came from
        origin: { kind: 'file_import', entryId: 'e1', sourceFileName: 'a.dna' },
      });
    }
    const pool = useStore.getState().primersById;
    expect(Object.keys(pool).sort()).toEqual(['p-a', 'p-b']);
    expect(pool['p-a'].sequence).toBe(null);
    expect(pool['p-a'].origin.sourceRecordIndex).toBe(0);
    expect(pool['p-b'].origin.sourceRecordIndex).toBe(1);
    expect(pool['p-a'].origin.format).toBe('snapgene');
  });

  it('an unknown tail stays unknown in the store', async () => {
    await useStore.getState().addPrimerToPool({
      primer: {
        id: 'p-t', schemaVersion: 2, name: 'no tail stated',
        sequence: 'ACGTACGTACGT', tail: null, sites: [],
      },
      projectId: null,
    });
    // '' would claim the file proved there is no overhang
    expect(useStore.getState().primersById['p-t'].tail).toBe(null);
  });
});

// -- C3 / RED 4: the production Overview host, not a direct map mount -------
describe('ANN-0L C3 - Library Overview draws primers on the real host', () => {
  const item = (topology) => ({
    id: 'e1', _libraryEntryId: 'e1', name: 'probe',
    topology,
    sequence: TEMPLATE.slice(0, LEN),
    annotations: [],
    // the identity a real commit stamps; the ingress path that produces it is
    // proved in __tests__/ann0m-primer-vertical.test.jsx
    resourceHash: 'h1',
  });

  it('a LINEAR molecule gets a primer-aware map, not a primerless mini-map', () => {
    const source = importedPrimer().sites[0];
    const primer = importedPrimer({
      sites: [{
        ...source,
        target: { ...source.target, topology: 'linear' },
      }],
    });
    render(<OverviewTab item={item('linear')} primers={[primer]} />);
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].getAttribute('data-primer-evidence')).toBe('source');
  });

  it('a CIRCULAR molecule draws the declared site through the host', () => {
    render(<OverviewTab item={item('circular')} primers={[importedPrimer()]} />);
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs.length).toBe(1);
    expect(glyphs[0].getAttribute('data-primer-evidence')).toBe('source');
  });

  it('passes the real sequence, so the computed fallback can run at all', () => {
    // no declared site: only a host that hands over the SEQUENCE (not just the
    // length) lets the projection locate this oligo
    const noSite = importedPrimer({
      sites: [], tail: '', bindingSequence: BIND, sequence: BIND,
    });
    render(<OverviewTab item={item('circular')} primers={[noSite]} />);
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs.length).toBeGreaterThan(0);
    expect(glyphs[0].getAttribute('data-primer-evidence')).toBe('computed');
  });

  it('shows a proven 5-prime tail on the circular map too', () => {
    render(<OverviewTab item={item('circular')} primers={[importedPrimer()]} />);
    expect(screen.queryByTestId('primer-site-tail')).toBeTruthy();
  });
});

// -- C3 / RED 5: SequenceView clips each segment under one occurrence -------
describe('ANN-0L C3 - SequenceView segment-wise clipping', () => {
  const base = {
    fullSeq: TEMPLATE.slice(0, LEN), lineStart: 0, lineLen: LEN,
    labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    entryId: 'e1', documentHash: 'h1', topology: 'circular',
  };

  const srcSite = (over) => ({
    id: 'st', target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
    strand: 1, annealedSequence: null, tail: null, sourceVisibility: 'shown',
    ...over,
  });

  const wrapPrimer = {
    id: 'pw', schemaVersion: 2, name: 'wrap', sequence: null,
    sites: [srcSite({
      id: 'sw',
      location: { kind: 'join', segments: [{ start: LEN - 6, end: LEN }, { start: 0, end: 6 }] },
    })],
  };

  const gappedPrimer = {
    id: 'pg', schemaVersion: 2, name: 'gapped', sequence: null,
    sites: [srcSite({
      id: 'sg',
      location: { kind: 'join', segments: [{ start: 20, end: 30 }, { start: 60, end: 70 }] },
    })],
  };

  it('draws a wrap as two pieces under ONE occurrence key', () => {
    render(<PrimerTrack {...base} primers={[wrapPrimer]} />);
    const parts = screen.getAllByTestId('sequence-view-primer');
    expect(parts.length).toBe(2);
    const keys = new Set(parts.map((p) => p.getAttribute('data-primer-occurrence-key')));
    expect(keys.size).toBe(1);
  });

  it('does not paint the gap between two non-contiguous segments', () => {
    render(<PrimerTrack {...base} primers={[gappedPrimer]} />);
    const parts = screen.getAllByTestId('sequence-view-primer');
    expect(parts.length).toBe(2);
    // each piece covers only its own segment; a flattened 20..70 band would
    // paint the 30 bases of gap between them
    const spans = parts.map((p) => p.getAttribute('data-primer-span')).sort();
    expect(spans).toEqual(['20-30', '60-70']);
  });

  it('keys selection on the occurrence, not on name plus start', () => {
    const twin = { ...gappedPrimer, id: 'pg2' };
    render(<PrimerTrack {...base} primers={[gappedPrimer, twin]} />);
    const keys = new Set(
      screen.getAllByTestId('sequence-view-primer')
        .map((p) => p.getAttribute('data-primer-occurrence-key')),
    );
    // two records at the SAME locus with the SAME name stay distinct
    expect(keys.size).toBe(2);
  });

  it('marks an unknown strand as unknown instead of defaulting to forward', () => {
    const noStrand = {
      id: 'pu', schemaVersion: 2, name: 'unknown strand', sequence: null,
      sites: [srcSite({
        id: 'su', strand: null,
        location: { kind: 'single', segments: [{ start: 30, end: 44 }] },
      })],
    };
    render(<PrimerTrack {...base} primers={[noStrand]} />);
    const el = screen.getAllByTestId('sequence-view-primer')[0];
    expect(el.getAttribute('data-primer-strand')).toBe('unknown');
  });
});
