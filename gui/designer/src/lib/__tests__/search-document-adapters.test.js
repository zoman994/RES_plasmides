/**
 * search-document-adapters — normalize a raw LibraryEntry into a SearchDocument (P1)
 * so the orchestrator never touches store shapes. Canonical fields with fallbacks
 * (payload.* vs top-level), status from origin.status, features from annotations with
 * their preserved qualifier whitelist.
 */
import { describe, it, expect } from 'vitest';
import {
  entryToDocument, collectEntryDocuments,
  projectToDocument, collectProjectDocuments,
  primerToDocument, collectPrimerDocuments,
  entryRevision, displayedDocEpoch,
} from '../search-document-adapters';

const ENTRY = {
  id: 'e1',
  kind: 'container',
  name: 'pBG-104',
  tags: ['экспрессия', 'glaA'],
  projectId: 'proj1',
  origin: { status: 'release', revision: 'r3' },
  payload: {
    sequence: 'ATGCATGCATGCATGC',
    topology: 'circular',
    description: 'glucoamylase host',
    organism: 'Aspergillus niger',
    annotations: [
      {
        id: 'a1', name: 'glaA', type: 'CDS', start: 100, end: 500, strand: 1,
        qualifiers: { gene: 'glaA', product: 'glucoamylase', locus_tag: 'AN_1234', EC_number: '3.2.1.3' },
      },
      { id: 'a2', name: 'AmpR', type: 'CDS', start: 700, end: 1500, strand: -1 },
    ],
  },
};

// ── U5-B · WHICH molecule, and WHICH document of it ───────────────────────────────────────────
describe('entryRevision — the identity a REAL library entry carries', () => {
  it('reads the top-level `version` the production model actually sets', () => {
    // `librarySlice` creates every entry with `version: 1` and bumps it on each saved commit.
    // Nothing in production writes `origin.revision`, so a guard that only read that field
    // compared null to null and passed a locus measured two saves ago.
    expect(entryRevision({ id: 'e', version: 1 })).toBe(1);
    expect(entryRevision({ id: 'e', version: 2 })).toBe(2);
    expect(entryToDocument({ id: 'e', version: 2, payload: { sequence: 'ACGT' } }).ref.revision).toBe(2);
  });

  it('`version` wins over every legacy fallback', () => {
    expect(entryRevision({ version: 5, origin: { revision: 'r3' }, rev: 'x', updatedAt: 9 })).toBe(5);
  });

  it('only a POSITIVE SAFE INTEGER is a version — anything else is not a revision', () => {
    // A revision that cannot be compared makes the stale guard answer confidently and wrongly, so
    // these fall through to the legacy fallbacks (here: none) rather than being trusted.
    for (const bad of [1.5, NaN, Infinity, -Infinity, 0, -3, '2', null, undefined, {}]) {
      expect(entryRevision({ id: 'e', version: bad }), String(bad)).toBeNull();
    }
    expect(entryRevision({ id: 'e', version: 1 })).toBe(1);
    expect(entryRevision({ id: 'e', version: Number.MAX_SAFE_INTEGER })).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('legacy records still resolve, and an unidentifiable one is null — never «current»', () => {
    expect(entryRevision({ origin: { revision: 'r3' } })).toBe('r3');
    expect(entryRevision({ updatedAt: 17 })).toBe(17);
    expect(entryRevision({})).toBeNull();
    expect(entryRevision(null)).toBeNull();
  });
});

describe('displayedDocEpoch — the saved molecule and the edit buffer are different documents', () => {
  it('the saved molecule is its version', () => {
    expect(displayedDocEpoch({ version: 2 })).toBe('v2#g0');
    // annotation-only edits do not change the SEQUENCE the coordinates refer to
    expect(displayedDocEpoch({ version: 2 }, { editedAnnotations: [{ id: 'a' }] })).toBe('v2#g0');
  });

  it('a transient sequence buffer is a different document, named by its GENERATION', () => {
    expect(displayedDocEpoch({ version: 2 }, { editedSequence: 'ACGT' }, { buffer: 1 })).toBe('v2#g0+b1');
    expect(displayedDocEpoch({ version: 2 }, { editedSequence: 'ACG' }, { buffer: 2 })).toBe('v2#g0+b2');
    // …and it is never equal to the saved document it was forked from
    expect(displayedDocEpoch({ version: 2 }, { editedSequence: 'ACGT' }, { buffer: 1 }))
      .not.toBe(displayedDocEpoch({ version: 2 }));
  });

  it('is O(1) — the token never reads the sequence content', () => {
    // Two megabase buffers at the SAME generation give the same token: nothing hashed the bases.
    // (They cannot both exist at one generation in production — every buffer change bumps it — so
    // this asserts the cost model, not an identity the app relies on.)
    const a = `A${'C'.repeat(1000000)}`;
    const b = `T${'G'.repeat(1000000)}`;
    expect(displayedDocEpoch({ version: 1 }, { editedSequence: a }, { buffer: 4 }))
      .toBe(displayedDocEpoch({ version: 1 }, { editedSequence: b }, { buffer: 4 }));
  });
});

// ── STAGE 1 · the generation is the ONLY thing that names a buffer ───────────────────────────────
/**
 * The token used to be `v<version>+e<editLog.length>/<buffer.length>`. Both numbers are properties
 * of the EDIT COUNT and the SIZE, not of the content, so three everyday operations produced two
 * different molecules wearing one identity: a same-length substitution, an undo (which rewrites the
 * log in place instead of growing it), and a topology flip (never in the token at all). A locus
 * measured on the first was then applied to the second with nothing to catch it.
 */
describe('displayedDocEpoch — a monotonic buffer generation, never the edit count or the length', () => {
  const ENTRY_V1 = { id: 'w', version: 1 };

  it('two DIFFERENT buffers of the same length and the same editLog length are different documents', () => {
    const before = { editedSequence: 'AAAACCCC', editLog: [{ op: 'sub' }] };
    const after = { editedSequence: 'AAAAGGGG', editLog: [{ op: 'sub' }] };  // one base substituted
    expect(displayedDocEpoch(ENTRY_V1, before, { buffer: 1 })).not.toBe(displayedDocEpoch(ENTRY_V1, after, { buffer: 2 }));
  });

  it('an UNDO followed by a different same-size edit is a new document', () => {
    // `useAnnotationUndoRedo.restore()` rewrites the buffer without touching editLog, and
    // `mergeCorrection` collapses consecutive corrections — so the log length can stay put while
    // the bases move. Only a counter that is bumped by the WRITE can see that.
    const typed = { editedSequence: 'ACGTACGT', editLog: [{ op: 'sub' }] };
    const retyped = { editedSequence: 'TGCATGCA', editLog: [{ op: 'sub' }] };
    expect(displayedDocEpoch(ENTRY_V1, typed, { buffer: 3 })).not.toBe(displayedDocEpoch(ENTRY_V1, retyped, { buffer: 5 }));
  });

  it('a TOPOLOGY-only buffer is not the saved molecule, and a flip is a new document', () => {
    // circular↔linear changes which loci exist at all (an origin-crossing hit is only reachable on
    // a ring), so the two readings are different documents even though no base moved.
    expect(displayedDocEpoch(ENTRY_V1, { editedTopology: 'linear' }, { buffer: 1 })).not.toBe(displayedDocEpoch(ENTRY_V1));
    expect(displayedDocEpoch(ENTRY_V1, { editedTopology: 'circular' }, { buffer: 1 }))
      .not.toBe(displayedDocEpoch(ENTRY_V1, { editedTopology: 'linear' }, { buffer: 2 }));
  });

  it('the token is STABLE for one generation — the same buffer answers the same', () => {
    expect(displayedDocEpoch(ENTRY_V1, { editedSequence: 'ACGT' }, { buffer: 7 }))
      .toBe(displayedDocEpoch(ENTRY_V1, { editedSequence: 'ACGT' }, { buffer: 7 }));
  });

  it('the saved epoch is untouched by the generation — no buffer, no suffix', () => {
    expect(displayedDocEpoch(ENTRY_V1, {}, { buffer: 9 })).toBe('v1#g0');
    expect(displayedDocEpoch(ENTRY_V1, null, { buffer: 9 })).toBe('v1#g0');
  });
});

describe('entryToDocument', () => {
  const d = entryToDocument(ENTRY);

  it('maps ref with kind, id, revision', () => {
    expect(d.ref).toMatchObject({ kind: 'entry', id: 'e1', revision: 'r3' });
  });
  it('maps title + textFields (name/tags/status/description/organism)', () => {
    expect(d.title).toBe('pBG-104');
    expect(d.textFields.name).toBe('pBG-104');
    expect(d.textFields.tags).toEqual(['экспрессия', 'glaA']);
    expect(d.textFields.status).toBe('release');
    expect(d.textFields.description).toBe('glucoamylase host');
    expect(d.textFields.organism).toBe('Aspergillus niger');
  });
  it('maps sequence + topology', () => {
    expect(d.sequence.seq).toBe('ATGCATGCATGCATGC');
    expect(d.sequence.topology).toBe('circular');
  });
  it('maps kind and projectId for downstream grouping/type filters', () => {
    expect(d.kind).toBe('container');
    expect(d.projectId).toBe('proj1');
  });
  it('maps features from annotations carrying id, name, type, coords, qualifiers', () => {
    expect(d.features).toHaveLength(2);
    const gla = d.features.find((f) => f.name === 'glaA');
    expect(gla).toMatchObject({ id: 'a1', type: 'CDS', start: 100, end: 500, strand: 1 });
    expect(gla.qualifiers).toMatchObject({ locus_tag: 'AN_1234', EC_number: '3.2.1.3', product: 'glucoamylase' });
  });

  it('falls back to top-level sequence/topology when payload is absent (canvas shape)', () => {
    const d2 = entryToDocument({ id: 'e2', name: 'x', sequence: 'ACGT', topology: 'linear' });
    expect(d2.sequence.seq).toBe('ACGT');
    expect(d2.sequence.topology).toBe('linear');
    expect(d2.features).toEqual([]);
  });
  it('circular flag via topology:{circular} object shape', () => {
    const d3 = entryToDocument({ id: 'e3', name: 'y', payload: { sequence: 'ACGT' }, topology: { circular: true } });
    expect(d3.sequence.topology).toBe('circular');
  });
  it('no sequence → sequence is undefined (a bare primer/label), title falls back to id', () => {
    const d4 = entryToDocument({ id: 'e4' });
    expect(d4.sequence).toBeUndefined();
    expect(d4.title).toBe('e4');
    expect(d4.textFields.tags).toEqual([]);
  });
});

describe('collectEntryDocuments', () => {
  it('maps a byId map, dropping _pendingDelete', () => {
    const docs = collectEntryDocuments({ e1: ENTRY, dead: { id: 'dead', name: 'z', _pendingDelete: true } });
    expect(docs.map((d) => d.ref.id)).toEqual(['e1']);
  });
  it('accepts an array too', () => {
    expect(collectEntryDocuments([ENTRY]).map((d) => d.ref.id)).toEqual(['e1']);
  });
});

// REV #2 §2/§3.4 — project + primer are their OWN entity kinds (composite entityKey §10.4).
const PROJECT = { id: 'p1', name: 'Gla project', description: 'glaA overexpression', tags: ['fungal', 'expr'] };
const POOL_PRIMER = { id: 'pr1', name: 'T7-fwd', sequence: 'TAATACGACTCACTATAGGG', tags: ['seq'], status: 'ordered', direction: 'forward', projectId: 'p1', resourceHash: 'h-abc' };

describe('projectToDocument / collectProjectDocuments (§2)', () => {
  it('maps a project to a project-kind document (name/description/tags, NO sequence)', () => {
    const d = projectToDocument(PROJECT);
    expect(d.ref).toEqual({ kind: 'project', id: 'p1' });
    expect(d.title).toBe('Gla project');
    expect(d.textFields.name).toBe('Gla project');
    expect(d.textFields.description).toBe('glaA overexpression');
    expect(d.textFields.tags).toEqual(['fungal', 'expr']);
    expect(d.sequence).toBeUndefined();
    expect(d.features).toEqual([]);
  });
  it('collects a byId map / array, dropping _pendingDelete + id-less (mirrors entry collector)', () => {
    const docs = collectProjectDocuments({ p1: PROJECT, dead: { id: 'd', name: 'z', _pendingDelete: true } });
    expect(docs.map((d) => d.ref.id)).toEqual(['p1']);
    expect(collectProjectDocuments([PROJECT]).map((d) => d.ref.kind)).toEqual(['project']);
  });
});

describe('primerToDocument / collectPrimerDocuments (§3.4)', () => {
  it('maps a pool primer to a primer-kind doc with linear sequence', () => {
    const d = primerToDocument(POOL_PRIMER);
    expect(d.ref).toEqual({ kind: 'primer', id: 'pr1' });
    expect(d.title).toBe('T7-fwd');
    expect(d.sequence).toEqual({ seq: 'TAATACGACTCACTATAGGG', topology: 'linear' });
    expect(d.textFields.tags).toEqual(['seq']);
    expect(d.textFields.status).toBe('ordered');
  });
  it('emits one doc per canonical pool primer', () => {
    const docs = collectPrimerDocuments({ pr1: POOL_PRIMER });
    expect(docs.map((d) => d.ref.id)).toEqual(['pr1']);
    expect(docs.every((d) => d.ref.kind === 'primer')).toBe(true);
  });
  it('bridges a legacy kind=primer entry ONLY when the pool has no resourceHash match', () => {
    const legacyDup = { id: 'legA', kind: 'primer', name: 'dup', resourceHash: 'h-abc', payload: { sequence: 'TAATACGACTCACTATAGGG' } };
    const legacyNew = { id: 'legB', kind: 'primer', name: 'unique-legacy', payload: { sequence: 'GGGGCCCC' } };
    const docs = collectPrimerDocuments({ pr1: POOL_PRIMER }, { legacyEntries: [legacyDup, legacyNew] });
    const ids = docs.map((d) => d.ref.id);
    expect(ids).toContain('pr1');       // canonical pool primer
    expect(ids).not.toContain('legA');  // deduped: same resourceHash as pr1
    expect(ids).toContain('legB');      // no match → bridged as a primer doc
    expect(docs.find((d) => d.ref.id === 'legB').ref.kind).toBe('primer');
  });
  it('falls back to id-match dedup when resourceHash is absent (nullable hash §3.4)', () => {
    const poolNoHash = { id: 'shared', name: 'p', sequence: 'ACGTACGT' }; // no resourceHash
    const legacySameId = { id: 'shared', kind: 'primer', name: 'legacy-shared', payload: { sequence: 'ACGTACGT' } };
    const docs = collectPrimerDocuments({ shared: poolNoHash }, { legacyEntries: [legacySameId] });
    expect(docs.filter((d) => d.ref.id === 'shared')).toHaveLength(1); // not double-emitted
    expect(docs.find((d) => d.ref.id === 'shared').title).toBe('p');    // canonical wins
  });

  // REV#2-S2-P1-B — the REAL legacy record stores its hash at payload.resourceHash, and two
  // legacy dupes must not both slip through (the seen-set has to grow as bridges are added).
  it('dedups a legacy primer by its REAL payload.resourceHash field', () => {
    const legacyReal = { id: 'legR', kind: 'primer', name: 'dup', payload: { sequence: 'TAATACGACTCACTATAGGG', resourceHash: 'h-abc' } };
    const docs = collectPrimerDocuments({ pr1: POOL_PRIMER }, { legacyEntries: [legacyReal] }); // pr1.resourceHash === 'h-abc'
    expect(docs.map((d) => d.ref.id)).not.toContain('legR');
  });
  it('two legacy dupes (same hash, none in pool) collapse to one — seen-set updated after the first', () => {
    const a = { id: 'la', kind: 'primer', name: 'A', payload: { sequence: 'GGGGCCCC', resourceHash: 'dup-h' } };
    const b = { id: 'lb', kind: 'primer', name: 'B', payload: { sequence: 'GGGGCCCC', resourceHash: 'dup-h' } };
    const docs = collectPrimerDocuments({}, { legacyEntries: [a, b] });
    expect(docs).toHaveLength(1);
  });
});
