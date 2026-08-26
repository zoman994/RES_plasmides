/**
 * ANN-0I — the single ingress owner.
 *
 * Two classes of defect live here and neither is visible from a parser test:
 *
 *   * success was reported before — or instead of — a durable commit.
 *     `addLibraryEntriesBulk` is async, takes an ARRAY, and drops any row
 *     without an `id`; StartScreen handed it an object, never awaited it, and
 *     showed «imported» regardless. Nothing was ever written.
 *   * a feature rejected during parsing vanished silently. The biologist saw
 *     a successful import of a molecule that had quietly lost a CDS.
 *
 * The store is stubbed at exactly the functions production calls, and every
 * test asserts the stub was invoked with the real contract shape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { importFilesToLibrary, shapePrimerForPool } from '../canonical-file-ingress';

function gbFile(name, { features = '', length = 600 } = {}) {
  const rows = Array.from({ length: Math.ceil(length / 60) }, (_, i) =>
    `${String(i * 60 + 1).padStart(9)} ${'acgtacgtac'.repeat(6).match(/.{1,10}/g).join(' ')}`);
  const text = `LOCUS       ${name.replace(/\..*$/, '')}            ${length} bp    DNA     linear   SYN 02-AUG-2026
DEFINITION  ingress fixture
FEATURES             Location/Qualifiers
${features}ORIGIN
${rows.join('\n')}
//
`;
  return new File([text], name, { type: 'text/plain' });
}

const VALID_CDS = `     CDS             101..400
                     /label="goodGene"
`;

/** A location pointing outside the molecule — must be refused, not clamped. */
const INVALID_CDS = `     CDS             5001..5400
                     /label="badGene"
`;

function makeStore({ commitDelayMs = 0, commit = null } = {}) {
  const calls = { bulk: [], primers: [] };
  return {
    calls,
    addLibraryEntriesBulk: vi.fn(async (entries) => {
      calls.bulk.push(entries);
      if (commitDelayMs) await new Promise((r) => setTimeout(r, commitDelayMs));
      if (typeof commit === 'function') return commit(entries);
      // Mirror the real slice: array in, committed rows out, `id` required.
      return (Array.isArray(entries) ? entries : []).filter((e) => e && e.id);
    }),
    addPrimerToPool: vi.fn(async ({ primer }) => {
      calls.primers.push(primer);
      return primer;
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block 4 — success may never precede a durable commit
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0I/4 — persistence before success', () => {
  it('passes an ARRAY of fully shaped entries and awaits the commit', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('good.gb', { features: VALID_CDS })],
      { store, autoAnnotate: false },
    );

    expect(store.addLibraryEntriesBulk).toHaveBeenCalledTimes(1);
    const [arg] = store.addLibraryEntriesBulk.mock.calls[0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(1);
    // the real slice drops rows without an id
    expect(typeof arg[0].id).toBe('string');
    expect(arg[0].id.length).toBeGreaterThan(0);
    expect(arg[0].payload.sequence.length).toBeGreaterThan(0);
    expect(result.committed).toHaveLength(1);
  });

  it('does not resolve success until the slow commit has settled', async () => {
    const store = makeStore({ commitDelayMs: 30 });
    let settled = false;
    const p = importFilesToLibrary(
      [gbFile('slow.gb', { features: VALID_CDS })],
      { store, autoAnnotate: false },
    ).then((r) => { settled = true; return r; });

    expect(settled).toBe(false);
    const result = await p;
    expect(settled).toBe(true);
    expect(result.committed).toHaveLength(1);
  });

  it('reports NO success when the store commits zero rows', async () => {
    const store = makeStore({ commit: () => [] });
    const result = await importFilesToLibrary(
      [gbFile('rejected.gb', { features: VALID_CDS })],
      { store, autoAnnotate: false },
    );

    expect(result.committed).toHaveLength(0);
    expect(result.ok).toBe(false);
  });

  it('surfaces a rejected commit as an error, not a silent no-op', async () => {
    const store = makeStore({ commit: () => { throw new Error('quota exceeded'); } });
    const result = await importFilesToLibrary(
      [gbFile('boom.gb', { features: VALID_CDS })],
      { store, autoAnnotate: false },
    );

    expect(result.committed).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/quota exceeded/);
  });

  it('stamps project ownership before persistence', async () => {
    const store = makeStore();
    await importFilesToLibrary(
      [gbFile('owned.gb', { features: VALID_CDS })],
      { store, projectId: 'proj-1', autoAnnotate: false },
    );
    const [entries] = store.addLibraryEntriesBulk.mock.calls[0];
    expect(entries[0].projectId).toBe('proj-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 5 — a rejected feature is never silent
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0I/5 — partial import is visible', () => {
  it('commits the valid biology and still reports the rejected feature', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('mixed.gb', { features: VALID_CDS + INVALID_CDS })],
      { store, autoAnnotate: false },
    );

    // the good CDS is persisted
    expect(result.committed).toHaveLength(1);
    const [entries] = store.addLibraryEntriesBulk.mock.calls[0];
    const names = entries[0].payload.annotations.map((a) => a.name);
    expect(names).toContain('goodGene');
    expect(names).not.toContain('badGene');

    // and the loss is reported, not swallowed
    expect(result.rejected.length).toBeGreaterThan(0);
    const warn = result.warnings.join(' | ');
    expect(warn).toMatch(/mixed\.gb/);
    expect(warn).toMatch(/badGene/);
  });

  it('the warning names the file, the count and at least the first reason', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('mixed.gb', { features: VALID_CDS + INVALID_CDS })],
      { store, autoAnnotate: false },
    );
    const [entry] = result.rejected;
    expect(entry.file).toBe('mixed.gb');
    expect(entry.count).toBeGreaterThanOrEqual(1);
    expect(entry.items[0].name).toBe('badGene');
    expect(String(entry.items[0].reason).length).toBeGreaterThan(0);
  });

  it('a fully valid file produces no warning', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('clean.gb', { features: VALID_CDS })],
      { store, autoAnnotate: false },
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('one malformed feature never aborts the whole molecule', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('mixed.gb', { features: INVALID_CDS + VALID_CDS })],
      { store, autoAnnotate: false },
    );
    expect(result.ok).toBe(true);
    expect(result.committed).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Primers reach the canonical pool through the canonical action
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0I — imported primers reach primersById', () => {
  const PRIMER_FEATURE = `     primer_bind     101..118
                     /label="fwd_check"
                     /note="sequence: ACGTACGTACGTACGTAC"
`;

  it('commits an imported primer through addPrimerToPool, linked to its entry', async () => {
    const store = makeStore();
    const result = await importFilesToLibrary(
      [gbFile('withprimer.gb', { features: PRIMER_FEATURE })],
      { store, projectId: 'proj-1', autoAnnotate: false },
    );

    expect(store.addPrimerToPool).toHaveBeenCalled();
    const [{ primer, projectId, origin, status }] = store.addPrimerToPool.mock.calls[0];
    expect(typeof primer.id).toBe('string');
    expect(primer.name).toBe('fwd_check');
    expect(projectId).toBe('proj-1');
    expect(status).toBe('imported');
    // `origin` is the sibling argument the slice's normalizePrimer stamps onto
    // the row — that is where the entry link actually lives.
    expect(origin.entryId).toBe(result.committed[0].id);
    expect(origin.sourceFileName).toBe('withprimer.gb');
  });

  it('does not commit primers when nothing was persisted', async () => {
    const store = makeStore({ commit: () => [] });
    await importFilesToLibrary(
      [gbFile('withprimer.gb', { features: PRIMER_FEATURE })],
      { store, autoAnnotate: false },
    );
    expect(store.addPrimerToPool).not.toHaveBeenCalled();
  });

  it('never invents a tail for a derived primer', async () => {
    const store = makeStore();
    await importFilesToLibrary(
      [gbFile('withprimer.gb', { features: PRIMER_FEATURE })],
      { store, autoAnnotate: false },
    );
    const [{ primer }] = store.addPrimerToPool.mock.calls[0];
    expect(primer.tail || '').toBe('');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ANN-0J Block 3 — ONE primer semantic matrix.
//
// Every row states which oligo the pool must end up with and why. The
// preference order is contractual: an explicit oligo, then the supported
// `/note="sequence: …"`, then a strand-aware binding sequence derived from the
// target. A tail is never invented, and one oligo is one pool row.
// ═══════════════════════════════════════════════════════════════════════════
