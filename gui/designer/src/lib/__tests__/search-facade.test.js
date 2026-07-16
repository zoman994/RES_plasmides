/**
 * search-facade — the assembled entry point the UI calls (P1.5). Wires:
 *   classifyQuery → search-service (stale-drop + instant metadata partial)
 *   → resolve (sequence dim off-thread via the worker client) → runSearch.
 * Tested with the inline fallback (no Worker) so the whole pipeline runs in-process.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';
import { entryToDocument } from '../search-document-adapters';
import { handleSearchMessage } from '../search-worker-core';

const mk = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
});

const DOCS = [
  mk({ id: 'a', name: 'pBG-104', seq: 'AAAGAATTGCCC', anns: [{ id: 'f1', name: 'AmpR', type: 'CDS' }] }),
  mk({ id: 'b', name: 'pUC19', seq: 'TTTTTTTTTTTT' }),
];

describe('createSearchFacade — metadata', () => {
  it('a feature query resolves to a session (no worker needed)', async () => {
    const facade = createSearchFacade(); // inline fallback
    const out = await facade.search('AmpR', DOCS, {});
    expect(out.stale).toBe(false);
    expect(out.session.results.map((r) => r.entityRef.id)).toEqual(['a']);
  });
});

describe('createSearchFacade — sequence dim through the (inline) worker path', () => {
  it('a seq: query attaches occurrences to the right document', async () => {
    const facade = createSearchFacade();
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    const r = out.session.results.find((x) => x.entityRef.id === 'a');
    const seq = r.matches.find((m) => m.dimension === 'sequence');
    expect(seq.occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(seq.occurrences[0].metrics.identity).toBe(1);
    // doc 'b' has no motif → not in results
    expect(out.session.results.some((x) => x.entityRef.id === 'b')).toBe(false);
  });

  it('emits an instant metadata partial before the final result', async () => {
    const facade = createSearchFacade();
    const onResult = vi.fn();
    await facade.search('pBG', DOCS, {}, onResult);
    const phases = onResult.mock.calls.map((c) => c[1].phase);
    expect(phases).toContain('partial');
    expect(phases).toContain('final');
  });
});

describe('createSearchFacade — protein (aa:) dimension', () => {
  it('THE FLAGSHIP — aa:HHHHHH finds the His-tag entry, maps it to nucleotides', async () => {
    const facade = createSearchFacade();
    const docs = [
      mk({ id: 'his', name: 'HisFusion', seq: 'ATGCATCATCATCATCATCATTAA', anns: [{ id: 'c', name: 'g', type: 'CDS', start: 0, end: 24, strand: 1 }] }),
      mk({ id: 'plain', name: 'pUC19', seq: 'ATGAAAAAAAAAAAATAA', anns: [{ id: 'c2', name: 'g', type: 'CDS', start: 0, end: 18, strand: 1 }] }),
    ];
    const out = await facade.search('aa:HHHHHH', docs, {});
    const ids = out.session.results.map((r) => r.entityRef.id);
    expect(ids).toContain('his');
    expect(ids).not.toContain('plain');
    const r = out.session.results.find((x) => x.entityRef.id === 'his');
    const prot = r.matches.find((m) => m.dimension === 'protein');
    expect(prot.occurrences[0].location.segments[0]).toEqual({ start: 3, end: 21 });
    expect(prot.occurrences[0].protein.intronExcluded).toBe(false);
  });

  it('finds ONE protein across codon-optimized (synonymous) DNA — the whole point', async () => {
    const facade = createSearchFacade();
    const docs = [
      mk({ id: 'cat', name: 'A', seq: 'ATGCATCATCATCATCATCATTAA', anns: [{ id: 'c', type: 'CDS', start: 0, end: 24, strand: 1 }] }),
      mk({ id: 'cac', name: 'B', seq: 'ATGCACCACCACCACCACCACTAA', anns: [{ id: 'c', type: 'CDS', start: 0, end: 24, strand: 1 }] }),
    ];
    const out = await facade.search('aa:HHHHHH', docs, {});
    expect(out.session.results.map((r) => r.entityRef.id).sort()).toEqual(['cac', 'cat']);
  });
});

describe('createSearchFacade — enzyme (re:) dimension', () => {
  it('re:EcoRI finds cut sites across the library, maps to recognition spans', async () => {
    const facade = createSearchFacade();
    const docs = [
      mk({ id: 'cut', name: 'has-EcoRI', seq: 'AAAGAATTCTTT' }),
      mk({ id: 'nocut', name: 'no-site', seq: 'AAAAAAAAAAAA' }),
    ];
    const out = await facade.search('re:EcoRI', docs, {});
    const ids = out.session.results.map((r) => r.entityRef.id);
    expect(ids).toContain('cut');
    expect(ids).not.toContain('nocut'); // regression: re:X does NOT list the whole library
    const enz = out.session.results.find((x) => x.entityRef.id === 'cut').matches.find((m) => m.dimension === 'enzyme');
    expect(enz.occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(enz.occurrences[0].enzyme.name).toBe('EcoRI');
  });
});

describe('createSearchFacade — prefs wiring (REV-1)', () => {
  it('ctx.opts.limit caps the GLOBAL result count (not just per-sequence)', async () => {
    const facade = createSearchFacade();
    const docs = [
      mk({ id: 'a', name: 'plasmid A' }), mk({ id: 'b', name: 'plasmid B' }), mk({ id: 'c', name: 'plasmid C' }),
    ];
    const out = await facade.search('plasmid', docs, { opts: { limit: 2 } });
    expect(out.session.results.length).toBe(2);
    expect(out.session.truncated).toBe(true);
  });
  it('ctx.minQueryLen gates an auto-detected DNA motif via classifyQuery', async () => {
    const facade = createSearchFacade();
    const docs = [mk({ id: 'x', name: 'ACGTACGT', seq: 'TTACGTACGTTT' })]; // 8-mer; name == the motif
    // Default minQueryLen (8) treats the 8-mer as a DNA motif (→ sequence dim). Raising it
    // to 12 makes it a NAME query only — proves the pref reaches classifyQuery.
    const dflt = await facade.search('ACGTACGT', docs, {});
    expect(dflt.session.results[0].matches.some((m) => m.dimension === 'sequence')).toBe(true);
    const out = await facade.search('ACGTACGT', docs, { minQueryLen: 12 });
    const r = out.session.results.find((x) => x.entityRef.id === 'x');
    expect(r.matches.some((m) => m.dimension === 'sequence')).toBe(false); // gated → no seq dim
    expect(r.matches.some((m) => m.dimension === 'name')).toBe(true);
  });
});

describe('createSearchFacade — lifecycle', () => {
  it('cancel() and terminate() do not throw', () => {
    const facade = createSearchFacade();
    expect(() => { facade.cancel(); facade.terminate(); }).not.toThrow();
  });
});

// A failing worker must not reject the whole search or hang it — but it must NOT be a
// silent false negative either. A genuine failure degrades to metadata-only AND flags
// the session `incomplete`; a cancellation is a superseded search and is stale-dropped
// with no flag (task #168).
describe('createSearchFacade — worker resilience', () => {
  const autoWorker = () => ({
    onmessage: null, onerror: null, onmessageerror: null, terminated: false,
    postMessage(msg) { const r = handleSearchMessage(msg); queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: r }); }); },
    terminate() { this.terminated = true; },
  });
  const crashingWorker = () => ({
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage() { queueMicrotask(() => { if (this.onerror) this.onerror({ message: 'boom' }); }); },
    terminate() {},
  });
  const silentWorker = () => ({
    onmessage: null, onerror: null, onmessageerror: null, postMessage() {}, terminate() {},
  });

  it('a successful sequence search is NOT flagged incomplete', async () => {
    const facade = createSearchFacade({ workerFactory: autoWorker });
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(out.session.results.some((r) => r.entityRef.id === 'a')).toBe(true);
    expect(out.session.incomplete).toBeFalsy();
  });

  it('a worker crash degrades to metadata-only AND flags the session incomplete (honest failure)', async () => {
    const facade = createSearchFacade({ workerFactory: crashingWorker });
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(out.stale).toBe(false);
    expect(out.session.incomplete).toBe(true);        // ← not a silent «nothing found»
    expect(out.session.incompleteDims).toContain('sequence');
  });

  it('an unavailable runtime worker never runs the sequence scan inline and reports incomplete', async () => {
    const facade = createSearchFacade({ workerFactory: () => null });
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(out.stale).toBe(false);
    expect(out.session.results).toEqual([]);
    expect(out.session.incomplete).toBe(true);
    expect(out.session.incompleteDims).toEqual(['sequence']);
  });

  it('terminate() settles an in-flight worker request — the search resolves, never hangs', async () => {
    const facade = createSearchFacade({ workerFactory: silentWorker });
    const p = facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    facade.terminate(); // rejects the hung request (TERMINATED) → the awaited search settles
    await expect(p).resolves.toBeDefined();
  });

  it('back-compat: a single `worker` instance still works (wrapped as a one-shot factory)', async () => {
    const facade = createSearchFacade({ worker: autoWorker() });
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(out.session.results.some((r) => r.entityRef.id === 'a')).toBe(true);
  });

  it('recreates the worker across facade lifecycles (StrictMode mount→cleanup→remount)', async () => {
    const workers = [];
    const factory = () => { const w = autoWorker(); workers.push(w); return w; };
    // lifecycle 1 — search spawns worker 1, then the facade is torn down
    const f1 = createSearchFacade({ workerFactory: factory });
    await f1.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(workers.length).toBe(1);
    f1.terminate();
    expect(workers[0].terminated).toBe(true);
    // lifecycle 2 — a fresh facade over the same factory spawns a NEW worker and works
    const f2 = createSearchFacade({ workerFactory: factory });
    const out = await f2.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(workers.length).toBe(2);
    expect(out.session.results.some((r) => r.entityRef.id === 'a')).toBe(true);
  });
});
