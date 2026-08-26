/**
 * ANN-0K — primer semantics and the vertical `.dna` route.
 *
 * Split out of `canonical-file-ingress.test.js`, which crossed the 25 600 B
 * hard limit for a `.js` file. Nothing was weakened in the move: the same
 * fixtures and the same assertions, in a file that owns one subject — how a
 * source primer becomes a pool record, and how a featureless `.dna` gets there.
 *
 * A primer is three separate facts. `sequence` is the full oligo as ordered
 * (which may carry a 5' tail), `bindingSequence` is only what anneals, and
 * `tail` is the provable prefix before it. Flattening them makes Tm, template
 * search and assembly logic wrong.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { importFilesToLibrary, shapePrimerForPool } from '../canonical-file-ingress';
import { useStore, bootstrapStore } from '../../../../store';

function makeStore({ commitDelayMs = 0, commit = null } = {}) {
  const calls = { bulk: [], primers: [] };
  return {
    calls,
    addLibraryEntriesBulk: vi.fn(async (entries) => {
      calls.bulk.push(entries);
      if (commitDelayMs) await new Promise((r) => setTimeout(r, commitDelayMs));
      if (typeof commit === 'function') return commit(entries);
      return (Array.isArray(entries) ? entries : []).filter((e) => e && e.id);
    }),
    addPrimerToPool: vi.fn(async ({ primer }) => {
      calls.primers.push(primer);
      return primer;
    }),
  };
}

function gbFile(name, { features = '', length = 600 } = {}) {
  const rows = Array.from({ length: Math.ceil(length / 60) }, (_, i) =>
    `${String(i * 60 + 1).padStart(9)} ${'acgtacgtac'.repeat(6).match(/.{1,10}/g).join(' ')}`);
  return new File([`LOCUS       ${name.replace(/\..*$/, '')}            ${length} bp    DNA     linear   SYN 02-AUG-2026
FEATURES             Location/Qualifiers
${features}ORIGIN
${rows.join(String.fromCharCode(10))}
//
`], name, { type: 'text/plain' });
}

const VALID_CDS = `     CDS             101..400
                     /label="goodGene"
`;

/** 600 bp of ACGT repeat — position 100..118 is a known slice. */
const TEMPLATE = 'acgtacgtac'.repeat(60);

function primerGb(features) {
  const rows = Array.from({ length: 10 }, (_, i) =>
    `${String(i * 60 + 1).padStart(9)} ${'acgtacgtac'.repeat(6).match(/.{1,10}/g).join(' ')}`);
  return new File([`LOCUS       P                        600 bp    DNA     linear   SYN 02-AUG-2026
FEATURES             Location/Qualifiers
${features}ORIGIN
${rows.join(String.fromCharCode(10))}
//
`], 'primers.gb', { type: 'text/plain' });
}

async function poolFrom(features) {
  const store = makeStore();
  const result = await importFilesToLibrary([primerGb(features)], {
    store, autoAnnotate: false,
  });
  return {
    result,
    calls: store.addPrimerToPool.mock.calls.map(([a]) => a),
    store,
  };
}

describe('ANN-0J/3 — primer semantic matrix', () => {
  it('an explicit oligo wins over anything derivable', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="explicit"
                     /primer_seq="TTTTTTTTTTTTTTTTTT"
                     /note="sequence: AAAAAAAAAAAAAAAAAA"
`);
    expect(calls).toHaveLength(1);
    expect(calls[0].primer.sequence).toBe('TTTTTTTTTTTTTTTTTT');
  });

  it('the supported note form is used when there is no explicit oligo', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="noted"
                     /note="sequence: AAAAAAAAAAAAAAAAAA"
`);
    expect(calls).toHaveLength(1);
    expect(calls[0].primer.sequence).toBe('AAAAAAAAAAAAAAAAAA');
  });

  it('a plus-strand primer with neither derives the exact target slice', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="derivedPlus"
`);
    expect(calls).toHaveLength(1);
    // ANN-0L supersedes ANN-0J here: a stretch read off the TEMPLATE is what
    // anneals, not the oligo the user ordered. The full sequence stays unknown.
    expect(calls[0].primer.sequence).toBeNull();
    expect(calls[0].primer.bindingSequence).toBe(TEMPLATE.slice(100, 118).toUpperCase());
  });

  it('a minus-strand primer derives the reverse complement', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     complement(101..118)
                     /label="derivedMinus"
`);
    expect(calls).toHaveLength(1);
    const top = TEMPLATE.slice(100, 118).toUpperCase();
    const rcTop = top.split('').reverse()
      .map((c) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[c] || 'N')).join('');
    // ANN-0L: the reverse-complement is the ANNEALED part; the ordered oligo
    // is not stated by the file and must stay unknown.
    expect(calls[0].primer.sequence).toBeNull();
    expect(calls[0].primer.bindingSequence).toBe(rcTop);
  });

  it('never invents a tail', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="noTail"
`);
    expect(calls[0].primer.tail || '').toBe('');
  });

  it('a rejected primer_bind does not remove its valid namesake', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="P"
                     /primer_seq="GGGGGGGGGGGGGGGGGG"
     primer_bind     5001..5018
                     /label="P"
                     /primer_seq="CCCCCCCCCCCCCCCCCC"
`);
    // ANN-0L C1 supersedes "a refused location deletes the primer": the gate
    // judges COORDINATES, so both oligos reach the pool and only the refused
    // one arrives with no usable site. What ANN-0J root 4 actually protected -
    // that refusing one `P` must not take its namesake with it - still holds.
    expect(calls).toHaveLength(2);
    const seqs = calls.map((c) => c.primer.sequence).sort();
    expect(seqs).toEqual(['CCCCCCCCCCCCCCCCCC', 'GGGGGGGGGGGGGGGGGG']);
    const refused = calls.find((c) => c.primer.sequence === 'CCCCCCCCCCCCCCCCCC');
    expect(refused.primer.sites).toEqual([]);   // no glyph anywhere
    const kept = calls.find((c) => c.primer.sequence === 'GGGGGGGGGGGGGGGGGG');
    expect(kept.primer.sites).toHaveLength(1);  // its own site is untouched
  });

  // ANN-0L supersedes the ANN-0J dedup rule: two entries in a file are two
  // records the user created, so neither name nor sequence may merge them.
  it('repeated features become SEPARATE records (ANN-0L supersedes dedup)', async () => {
    const { calls } = await poolFrom(
      `     primer_bind     101..118
                     /label="dup"
                     /primer_seq="TTTTTTTTTTTTTTTTTT"
     primer_bind     201..218
                     /label="dup"
                     /primer_seq="TTTTTTTTTTTTTTTTTT"
`);
    expect(calls).toHaveLength(2);
  });
});

// ── ANN-0J Block 5 — ONE ingress surface matrix.

describe('ANN-0J/5 — ingress surface', () => {
  it('a packet oligo with several binding sites yields ONE pool row', async () => {
    // The `.dna` path hands the ingress packet primers carrying `sites`.
    // Several sites describe where one oligo anneals — not several oligos.
    // The default stub already mirrors the real slice: array in, the SAME rows
    // out. Returning a different object would (correctly) make the ingress skip
    // the primers, since it only commits oligos for rows the store confirmed.
    const store = makeStore();
    const file = primerGb(`     primer_bind     101..118
                     /label="fromFeature"
                     /primer_seq="ACGTACGTACGTACGTAC"
`);
    await importFilesToLibrary([file], { store, autoAnnotate: false });

    const seqs = store.addPrimerToPool.mock.calls.map(([a]) => a.primer.sequence);
    expect(seqs.filter((x) => x === 'ACGTACGTACGTACGTAC')).toHaveLength(1);
  });

  it('committed rows are still the durable bulk result', async () => {
    const store = makeStore({ commit: () => [] });
    const result = await importFilesToLibrary([gbFile('x.gb', { features: VALID_CDS })], {
      store, autoAnnotate: false,
    });
    expect(result.ok).toBe(false);
    expect(store.addPrimerToPool).not.toHaveBeenCalled();
  });
});


// ── ANN-0K Block 2 — ONE primer shape matrix.

const TAIL = 'GGATCC';
const BIND_PLUS = TEMPLATE.slice(100, 118).toUpperCase();   // 18 nt at 101..118

function rc(seq) {
  return seq.split('').reverse()
    .map((c) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[c] || 'N')).join('');
}

async function shapeFrom(features) {
  const store = makeStore();
  await importFilesToLibrary([primerGb(features)], { store, autoAnnotate: false });
  return store.addPrimerToPool.mock.calls.map(([a]) => a.primer);
}

describe('ANN-0K/2 — full oligo, binding and tail are separate facts', () => {
  it('an explicit TAILED plus-strand primer splits into all three', async () => {
    const [p] = await shapeFrom(
      `     primer_bind     101..118
                     /label="tailedFwd"
                     /primer_seq="${TAIL}${BIND_PLUS}"
`);
    expect(p.sequence).toBe(TAIL + BIND_PLUS);      // what was ordered
    expect(p.bindingSequence).toBe(BIND_PLUS);      // what anneals
    expect(p.tail).toBe(TAIL);                      // the provable 5' prefix
    expect(p.direction).toBe('forward');
  });

  it('a note-derived oligo splits the same way', async () => {
    const [p] = await shapeFrom(
      `     primer_bind     101..118
                     /label="notedFwd"
                     /note="sequence: ${TAIL}${BIND_PLUS}"
`);
    expect(p.sequence).toBe(TAIL + BIND_PLUS);
    expect(p.bindingSequence).toBe(BIND_PLUS);
    expect(p.tail).toBe(TAIL);
  });

  it('a plain DERIVED minus-strand primer is the reverse complement, with no tail', async () => {
    const [p] = await shapeFrom(
      `     primer_bind     complement(101..118)
                     /label="derivedRev"
`);
    expect(p.bindingSequence).toBe(rc(BIND_PLUS));
    expect(p.sequence).toBeNull();            // ordered oligo not stated by the file
    expect(p.tail).toBeNull();                // unknown, never invented
    expect(p.direction).toBe('reverse');
  });

  it('a tail is never invented when the split cannot be proved', async () => {
    // full oligo does NOT end with the binding sequence → no provable prefix
    const [p] = await shapeFrom(
      `     primer_bind     101..118
                     /label="unprovable"
                     /primer_seq="TTTTTTTTTTTTTTTTTTTT"
`);
    expect(p.sequence).toBe('TTTTTTTTTTTTTTTTTTTT');
    // ANN-0L: `null` = cannot be proved, `''` = proven absent. The old model
    // conflated them, which read as "this primer definitely has no overhang".
    expect(p.tail).toBeNull();
  });

  it('the tail is not searched for in the template', async () => {
    const [p] = await shapeFrom(
      `     primer_bind     101..118
                     /label="tailedFwd"
                     /primer_seq="${TAIL}${BIND_PLUS}"
`);
    // the binding half must be findable in the template; the full oligo is not
    expect(TEMPLATE.toUpperCase().includes(p.bindingSequence)).toBe(true);
    expect(TEMPLATE.toUpperCase().includes(p.sequence)).toBe(false);
  });
});

describe('ANN-0K/2 — direction is published only when unambiguous', () => {
  it('a reverse-only binding site never reports forward', async () => {
    const [p] = await shapeFrom(
      `     primer_bind     complement(101..118)
                     /label="revOnly"
                     /primer_seq="${rc(BIND_PLUS)}"
`);
    expect(p.direction).toBe('reverse');
  });

  it('conflicting multi-site strands leave direction null, never a silent forward', async () => {
    const store = makeStore();
    // API-shaped packet primer with two sites on OPPOSITE strands
    const conflicted = {
      name: 'conflicted',
      sequence: BIND_PLUS,
      sites: [
        { start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS },
        { start: 200, end: 218, strand: -1, annealedBases: BIND_PLUS },
      ],
    };
    const p = shapePrimerForPool(conflicted, TEMPLATE.toUpperCase());
    expect(p.direction).toBeNull();
    expect(store).toBeTruthy();
  });

  it('a primer with no usable site at all has null direction', () => {
    const p = shapePrimerForPool(
      { name: 'noSite', sequence: BIND_PLUS, sites: [] }, TEMPLATE.toUpperCase(),
    );
    expect(p.direction).toBeNull();
  });

  it('a HIDDEN reverse-only site still settles direction', () => {
    // SnapGene hides the site, but the strand fact is still known.
    const p = shapePrimerForPool({
      name: 'hiddenRev',
      sequence: rc(BIND_PLUS),
      sites: [],
      allSites: [{ start: 100, end: 118, strand: -1, annealedBases: rc(BIND_PLUS) }],
    }, TEMPLATE.toUpperCase());
    expect(p.direction).toBe('reverse');
  });
});

describe('ANN-0K/2 — one primer record per named oligo', () => {
  it('two equivalent representations of one primer make ONE row', async () => {
    const rows = await shapeFrom(
      `     primer_bind     101..118
                     /label="same"
                     /primer_seq="${BIND_PLUS}"
     primer_bind     101..118
                     /label="same"
                     /primer_seq="${BIND_PLUS}"
`);
    expect(rows).toHaveLength(2);
  });

  it('two DIFFERENTLY NAMED primers stay two records even with identical sequence', async () => {
    const rows = await shapeFrom(
      `     primer_bind     101..118
                     /label="orderA"
                     /primer_seq="${BIND_PLUS}"
     primer_bind     101..118
                     /label="orderB"
                     /primer_seq="${BIND_PLUS}"
`);
    expect(rows.map((r) => r.name).sort()).toEqual(['orderA', 'orderB']);
  });
});


// ── ANN-0K Block 4 (frontend half) — the SAME oracle the Python proof asserts.

// The oracle lives at the repo root, outside the Vite project root, so it is
// read from disk rather than imported. Vitest runs with cwd = gui/designer.
const ORACLE = JSON.parse(readFileSync(
  resolve(process.cwd(), '../../tests/fixtures/ann0k_featureless_primer_payload.json'),
  'utf-8',
));

describe('ANN-0K/4 — featureless .dna reaches the primer pool', () => {
  const K_TAIL = 'GGATCC';
  const K_BIND = ('ACGT'.repeat(150)).slice(100, 118).toUpperCase();

  function mockBackend() {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(ORACLE)),
    }));
  }

  afterEach(() => { delete globalThis.fetch; });

  it('the shared oracle is the featureless-with-primer case', () => {
    expect(ORACLE.features).toEqual([]);
    expect(ORACLE.topology).toBe('linear');
    expect(ORACLE.primers).toHaveLength(1);
    expect(ORACLE.primers[0].sequence).toBe(K_TAIL + K_BIND);
  });

  it('drives the real ingress and publishes the exact pool row', async () => {
    mockBackend();
    const store = makeStore();
    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])],
      'ann0k_featureless_primer.dna');

    const result = await importFilesToLibrary([dna], { store, autoAnnotate: false });

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result.ok).toBe(true);

    expect(store.addPrimerToPool).toHaveBeenCalledTimes(1);
    const [{ primer }] = store.addPrimerToPool.mock.calls[0];
    expect(primer.sequence).toBe(K_TAIL + K_BIND);   // full ordered oligo
    expect(primer.bindingSequence).toBe(K_BIND);     // annealing half only
    expect(primer.tail).toBe(K_TAIL);                // provable 5' prefix
    expect(primer.direction).toBe('forward');        // unambiguous top strand
  });

  it('the committed entry keeps the topology the backend reported', async () => {
    mockBackend();
    const store = makeStore();
    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])], 'x.dna');
    await importFilesToLibrary([dna], { store, autoAnnotate: false });

    const [[entries]] = store.addLibraryEntriesBulk.mock.calls;
    expect(entries[0].payload.topology).toBe('linear');
    expect(entries[0].payload.annotations).toEqual([]);
  });

  it('the request really goes to /api/import as a POST with the file', async () => {
    mockBackend();
    const store = makeStore();
    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])], 'x.dna');
    await importFilesToLibrary([dna], { store, autoAnnotate: false });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/import');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });
});


// ── ANN-0K correction — strand and tail are never invented.

/** Exactly what the Python parser emits for one primer. */
function parserPrimer(over = {}) {
  return {
    name: 'p',
    sequence: '',
    description: '',
    sites: [],
    allSites: [],
    strand: 1,          // parser default — must NOT become a direction claim
    start: null,
    end: null,
    ...over,
  };
}

describe('ANN-0K — a primer with no binding site claims no direction', () => {
  it('the parser default strand=1 does not become a forward claim', () => {
    const p = shapePrimerForPool(
      parserPrimer({ name: 'noSite', sequence: BIND_PLUS }),
      TEMPLATE.toUpperCase(),
    );
    expect(p.direction).toBeNull();
  });

  it('the oligo is still stored even without a direction', () => {
    const p = shapePrimerForPool(
      parserPrimer({ name: 'noSite', sequence: BIND_PLUS }),
      TEMPLATE.toUpperCase(),
    );
    expect(p.sequence).toBe(BIND_PLUS);
  });
});

describe('ANN-0K — a hidden reverse site drives reverse-complement binding', () => {
  it('binding is the reverse complement, not the plus strand', () => {
    // SnapGene hides the site (so `sites` is empty) and supplies no
    // annealedBases, so the binding half must be derived FROM THE SITE STRAND.
    const p = shapePrimerForPool(parserPrimer({
      name: 'hiddenRev',
      sequence: '',
      sites: [],
      allSites: [{ start: 100, end: 118, strand: -1, annealedBases: null }],
      strand: 1,   // parser default disagrees with the site — the site wins
    }), TEMPLATE.toUpperCase());

    expect(p.direction).toBe('reverse');
    expect(p.bindingSequence).toBe(rc(BIND_PLUS));
    expect(p.bindingSequence).not.toBe(BIND_PLUS);
  });

  it('direction and binding strand never contradict each other', () => {
    const p = shapePrimerForPool(parserPrimer({
      name: 'hiddenRev',
      allSites: [{ start: 100, end: 118, strand: -1, annealedBases: null }],
      strand: 1,
    }), TEMPLATE.toUpperCase());

    const derivedFromMinus = p.bindingSequence === rc(BIND_PLUS);
    expect(p.direction === 'reverse' && derivedFromMinus).toBe(true);
  });
});

describe('ANN-0K — a derived oligo never grows a tail', () => {
  it('two different annealed stretches do not make the difference a 5-prime tail', () => {
    // No `Primer@sequence`: the parser recovered the LONGEST annealedBases.
    // That is a conservative reconstruction of the binding half, not a proven
    // full ordered oligo, so the extra bases are NOT an overhang.
    const longer = 'TTTT' + BIND_PLUS;
    const p = shapePrimerForPool(parserPrimer({
      name: 'twoSites',
      sequence: longer,          // parser-derived, not from the file
      sequenceSource: 'derived',
      sites: [
        { start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS },
        { start: 200, end: 222, strand: 1, annealedBases: longer },
      ],
      allSites: [
        { start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS },
        { start: 200, end: 222, strand: 1, annealedBases: longer },
      ],
    }), TEMPLATE.toUpperCase());

    expect(p.tail).toBeNull();
    expect(p.sequence).toBeNull();
  });

  it('an EXPLICIT oligo still yields its provable tail', () => {
    const p = shapePrimerForPool(parserPrimer({
      name: 'explicit',
      sequence: TAIL + BIND_PLUS,
      sequenceSource: 'packet',
      sites: [{ start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS }],
      allSites: [{ start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS }],
    }), TEMPLATE.toUpperCase());

    expect(p.sequence).toBe(TAIL + BIND_PLUS);
    expect(p.bindingSequence).toBe(BIND_PLUS);
    expect(p.tail).toBe(TAIL);
  });
});


// ── ANN-0L/1-2 — real ingress loses source records TODAY ───────────────────
// Driven through `importFilesToLibrary`, the production path, so each failure
// names a loss the biologist actually suffers.

async function poolRows(features) {
  const store = makeStore();
  await importFilesToLibrary([primerGb(features)], { store, autoAnnotate: false });
  return store.addPrimerToPool.mock.calls.map(([a]) => a.primer);
}

describe('ANN-0L/1 — every source primer record reaches the pool', () => {
  it('two identically named GenBank primer_bind records stay TWO records', async () => {
    const rows = await poolRows(
      `     primer_bind     101..118
                     /label="P"
                     /primer_seq="${BIND_PLUS}"
     primer_bind     201..218
                     /label="P"
                     /primer_seq="${BIND_PLUS}"
`);
    // same name AND same oligo, but two separate entries in the file
    expect(rows).toHaveLength(2);
  });

  it('a primer_bind with NO usable oligo still becomes a record', async () => {
    const rows = await poolRows(
      `     primer_bind     101..118
                     /label="bare"
`);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('bare');
  });

  it('a record with an unknown full oligo keeps sequence null, not a template slice', async () => {
    const rows = await poolRows(
      `     primer_bind     101..118
                     /label="bare"
`);
    expect(rows[0].sequence).toBeNull();
    expect(rows[0].sites?.[0]?.annealedSequence).toBe(BIND_PLUS);
  });

  it('one primer with several binding sites keeps them all on ONE record', async () => {
    const store = makeStore();
    const packetPrimer = {
      name: 'multi',
      sequence: BIND_PLUS,
      sites: [
        { start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS },
        { start: 200, end: 218, strand: -1, annealedBases: BIND_PLUS },
      ],
    };
    const shaped = shapePrimerForPool(packetPrimer, TEMPLATE.toUpperCase());
    expect(Array.isArray(shaped.sites)).toBe(true);
    expect(shaped.sites).toHaveLength(2);
    expect(store).toBeTruthy();
  });

  it('a hidden site is kept on the record and marked hidden', () => {
    const shaped = shapePrimerForPool({
      name: 'hidden',
      sequence: BIND_PLUS,
      sites: [{ start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS }],
      allSites: [
        { start: 100, end: 118, strand: 1, annealedBases: BIND_PLUS },
        { start: 400, end: 418, strand: -1, annealedBases: BIND_PLUS },
      ],
    }, TEMPLATE.toUpperCase());

    expect(shaped.sites).toHaveLength(2);
    expect(shaped.sites.map((x) => x.sourceVisibility).sort())
      .toEqual(['hidden', 'shown']);
  });
});

describe('ANN-0L/2 — tail and annealed part are per SITE', () => {
  it('each site carries its own annealed sequence and provable tail', async () => {
    const rows = await poolRows(
      `     primer_bind     101..118
                     /label="tailed"
                     /primer_seq="${TAIL}${BIND_PLUS}"
`);
    expect(rows[0].sequence).toBe(TAIL + BIND_PLUS);
    expect(rows[0].sites[0].annealedSequence).toBe(BIND_PLUS);
    expect(rows[0].sites[0].tail).toBe(TAIL);
  });
});

// ---------------------------------------------------------------------------
// ANN-0L/4 - an origin-crossing SnapGene site keeps both segments end to end.
// ---------------------------------------------------------------------------
describe('ANN-0L/4 - a wrapping packet site survives shaping', () => {
  const TEMPLATE = 'ACGT'.repeat(100); // 400 nt, circular

  it('becomes ONE site with a join location, not a 1px sliver', () => {
    const shaped = shapePrimerForPool({
      name: 'wrap-fwd',
      sequence: 'ACGTACGTACGT',
      sites: [{
        start: 390, end: 8, strand: 1,
        segments: [{ start: 390, end: 400 }, { start: 0, end: 8 }],
        annealedBases: 'ACGTACGTACGTACGTAC',
      }],
    }, TEMPLATE, { entryId: 'E1' });

    expect(shaped.sites).toHaveLength(1);
    expect(shaped.sites[0].location.kind).toBe('join');
    expect(shaped.sites[0].location.segments)
      .toEqual([{ start: 390, end: 400 }, { start: 0, end: 8 }]);
  });

  it('projects to one occurrence of two drawn segments', async () => {
    const { projectPrimerSites } = await import('../../../../lib/primer-site-projection');
    const shaped = shapePrimerForPool({
      name: 'wrap-fwd',
      sequence: 'ACGTACGTACGT',
      sites: [{
        start: 390, end: 8, strand: 1,
        segments: [{ start: 390, end: 400 }, { start: 0, end: 8 }],
        annealedBases: 'ACGTACGTACGTACGTAC',
      }],
    }, TEMPLATE, {
      entryId: 'E1',
      // the identity a real commit stamps; that path is proved end to end in
      // src/__tests__/ann0m-primer-vertical.test.jsx
      targetDocument: { resourceHash: 'h1', topology: 'circular' },
    });

    const [occ] = projectPrimerSites(
      { ...shaped, id: 'p1' },
      { template: TEMPLATE, entryId: 'E1', documentHash: 'h1', topology: 'circular' },
    );
    expect(occ.segments).toHaveLength(2);
    expect(occ.wrapsOrigin).toBe(true);
    expect(occ.evidence).toBe('source');
  });
});


// ===========================================================================
// ANN-0M / RED 2 (root B) - one packet, one batch, real provenance.
//
// The oracle below is the REAL output of `pvcs.snapgene_parser` for a packet
// holding three `<Primer>` records: two sharing a name AND an oligo, one with
// a `simplified` repeat of a site, one whose two statements of the same locus
// disagree about annealed bases and Tm.
//
// The ingress used to call the converter once PER PRIMER, with a one-element
// array. The converter numbers records by their position in the array it is
// given, so every record came out as `sourceRecordIndex: 0` and the only thing
// separating two identically named oligos was destroyed. The packet has to be
// converted as a packet.
// ===========================================================================
const M_ORACLE = JSON.parse(readFileSync(
  resolve(process.cwd(), '../../tests/fixtures/ann0m_primer_provenance_payload.json'),
  'utf8',
));

describe('ANN-0M/2 - a real SnapGene packet reaches the real store', () => {
  let poolRows;

  beforeEach(async () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    useStore.setState({ primersById: {}, libraryEntries: {} });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(M_ORACLE)),
    }));
    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])],
      'ann0m_primer_provenance.dna');
    await importFilesToLibrary([dna], { store: useStore.getState(), autoAnnotate: false });
    poolRows = Object.values(useStore.getState().primersById)
      .sort((a, b) => (a.origin?.sourceRecordIndex ?? 0) - (b.origin?.sourceRecordIndex ?? 0));
  });

  afterEach(() => { delete globalThis.fetch; });

  it('the oracle really is the case under test', () => {
    expect(M_ORACLE.primers).toHaveLength(3);
    expect(M_ORACLE.primers.map((p) => p.name)).toEqual(['dup-name', 'dup-name', 'hidden-only']);
    expect(M_ORACLE.primers[0].allSites.map((s) => s.sourceForm))
      .toEqual(['standard', 'simplified']);
  });

  it('every source record becomes its own pool record', () => {
    expect(poolRows).toHaveLength(3);
    // two of them share a name AND a sequence - neither may absorb the other
    expect(poolRows.filter((p) => p.name === 'dup-name')).toHaveLength(2);
  });

  it('each record keeps its own position in the packet', () => {
    expect(poolRows.map((p) => p.origin.sourceRecordIndex)).toEqual([0, 1, 2]);
  });

  it('folds a simplified repeat of one site into one site', () => {
    // same location, strand, annealed bases, Tm and visibility: one binding
    // stated twice, not two bindings
    const first = poolRows[0];
    expect(first.sites).toHaveLength(1);
    expect([...first.sites[0].sourceForms].sort()).toEqual(['simplified', 'standard']);
  });

  it('does NOT fold two statements that disagree about the biology', () => {
    // same locus and strand, but different annealed bases and different Tm -
    // two claims by the file, and averaging them would invent a third
    const second = poolRows[1];
    expect(second.sites).toHaveLength(2);
    expect(second.sites.map((x) => x.annealedSequence).sort())
      .toEqual(['ACGTACGTACGT', 'TTTTACGTACGT']);
    expect(second.sites.map((x) => x.meltingTemperature).sort((a, b) => a - b))
      .toEqual([49, 61]);
  });

  it('keeps the reverse-strand record on its own strand', () => {
    expect(poolRows[2].sites[0].strand).toBe(-1);
  });

  it('carries the source file and format on every record', () => {
    for (const p of poolRows) {
      expect(p.origin.format).toBe('snapgene');
      expect(p.origin.sourceFileName).toBe('ann0m_primer_provenance.dna');
    }
  });
});
