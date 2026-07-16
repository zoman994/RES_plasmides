/**
 * REV #2 Stage 2 corrective P1s (Игорь review 14.07) — the worker channel + scope ordering
 * that the K1–K5 green tests did NOT exercise:
 *  • P1-A: entityKey composite must reach the WORKER map (was keyed by bare ref.id → an
 *          entry and a primer sharing an id clobbered each other).
 *  • P1-D: scope (§10.3) must be applied BEFORE the DNA worker, not only before ranking —
 *          `mol: seq:` must not ship primers to the worker (and vice-versa).
 */
import { describe, it, expect } from 'vitest';
import { createSearchFacade } from '../search-facade';
import { entryToDocument, primerToDocument } from '../search-document-adapters';
import { handleSearchMessage } from '../search-worker-core';

describe('P1-A — the worker byId map keys by composite <kind>:<id>, no cross-kind collision', () => {
  it('an entry and a primer sharing a local id each get their OWN sequence occurrences', async () => {
    const facade = createSearchFacade(); // inline path also goes through toWorkerDocs
    const entryDoc = entryToDocument({ id: 'x', name: 'mol-x', payload: { sequence: 'AAAGAATTCTTT', topology: 'linear' } });
    const primerDoc = primerToDocument({ id: 'x', name: 'primer-x', sequence: 'TTTTTTTTTTTT' }); // no motif
    const out = await facade.search('seq:GAATTC', [entryDoc, primerDoc], { bothStrands: false });
    const entryRes = out.session.results.find((r) => r.entityRef.kind === 'entry' && r.entityRef.id === 'x');
    // the entry's own hit must survive — with the bare-id bug the primer 'x' clobbered it
    expect(entryRes).toBeDefined();
    expect(entryRes.matches.some((m) => m.dimension === 'sequence')).toBe(true);
    const primerRes = out.session.results.find((r) => r.entityRef.kind === 'primer' && r.entityRef.id === 'x');
    // the primer has no motif → it must NOT inherit the entry's occurrence
    expect(primerRes?.matches.some((m) => m.dimension === 'sequence')).toBeFalsy();
  });
});

describe('P1-D — scope is applied BEFORE the DNA worker (§10.3), not only before ranking', () => {
  const makeCaptureWorker = (seen) => () => ({
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage(msg) {
      (msg.docs || []).forEach((d) => seen.push(d.id));
      const r = handleSearchMessage(msg);
      queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: r }); });
    },
    terminate() {},
  });

  it('mol: … seq: ships only entry docs to the worker — the primer is never scanned', async () => {
    const seen = [];
    const facade = createSearchFacade({ workerFactory: makeCaptureWorker(seen) });
    const entryDoc = entryToDocument({ id: 'e1', name: 'pUC', payload: { sequence: 'AAAGAATTCTTT', topology: 'circular' } });
    const primerDoc = primerToDocument({ id: 'pr1', name: 'pUC-primer', sequence: 'GAATTCAAAAAA' }); // also has the motif
    await facade.search('mol:pUC seq:GAATTC', [entryDoc, primerDoc], { bothStrands: false });
    expect(seen).toContain('entry:e1');
    expect(seen.some((k) => k.includes('pr1'))).toBe(false); // primer NOT sent to the worker (out of mol scope)
  });

  it('primer: … seq: ships only primer docs to the worker — the molecule is never scanned', async () => {
    const seen = [];
    const facade = createSearchFacade({ workerFactory: makeCaptureWorker(seen) });
    const entryDoc = entryToDocument({ id: 'e1', name: 'host', payload: { sequence: 'AAAGAATTCTTT', topology: 'circular' } });
    const primerDoc = primerToDocument({ id: 'pr1', name: 'fwd', sequence: 'GAATTCAAAAAA' });
    await facade.search('primer:fwd seq:GAATTC', [entryDoc, primerDoc], { bothStrands: false });
    expect(seen).toContain('primer:pr1');
    expect(seen.some((k) => k.includes('e1'))).toBe(false); // molecule NOT sent to the worker (out of primer scope)
  });
});
