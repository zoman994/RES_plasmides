/**
 * REV #2 — S3-CLOSE / K3.3: `search-types.js` must describe the runtime that actually exists.
 *
 * These typedefs are JSDoc — they vanish at build time, so nothing enforces them and they drift
 * silently. A stale contract is worse than none: the next author reads `SearchLocation.targetKey`,
 * writes code against a field no producer has ever set, and only finds out in the browser.
 *
 * So the contract is checked STATICALLY: the test reads the source, extracts each NAMED typedef
 * block, and asserts field-by-field. Not a whole-file snapshot — a snapshot would go red on a
 * comment reflow and teach everyone to re-bless it without reading.
 *
 * Every claim below was verified against the live producer (cited per assertion). K3.3 is
 * documentation-only: no producer shape was changed to fit a typedef.
 */
import { describe, it, expect } from 'vitest';
// `?raw` — Vite hands us the SOURCE text. The typedefs do not exist at runtime, so the only way
// to assert them is to read what is written.
import SRC from '../search-types.js?raw';

// The body of `@typedef {Object} <Name>` up to the end of that JSDoc block.
function typedefBlock(name) {
  // \b, not `\n` — the checkout may be CRLF, and `SearchResult` must not match `SearchResultX`.
  const m = new RegExp(`@typedef \\{Object\\} ${name}\\b`).exec(SRC);
  if (!m) throw new Error(`typedef ${name} not found in search-types.js`);
  const end = SRC.indexOf('*/', m.index);
  return SRC.slice(m.index, end);
}
/** Declared property names of a typedef. Types nest braces (`{{ a, b }} textFields`,
 * `{Array<{start,end}>} segments`), so the name is the first identifier that follows a closing
 * brace — not a naive `[^}]*` scan, which stops at the inner one. */
function props(name) {
  return typedefBlock(name).split('@property').slice(1).map((chunk) => {
    const m = chunk.match(/\}\s+\[?([A-Za-z0-9_]+)\]?/);
    return m ? m[1] : null;
  }).filter(Boolean);
}
const hasProp = (name, prop) => props(name).includes(prop);
/** Is the property declared OPTIONAL, i.e. `[name]`? */
const isOptional = (name, prop) => new RegExp(`\\[${prop}\\]`).test(typedefBlock(name));

describe('search-types — SearchDocument matches what the adapters actually build', () => {
  it.each([
    ['ref'], ['title'], ['textFields'], ['sequence'],
    // search-document-adapters::entryToDocument emits these; library-search and the VM read them.
    ['features'],   // consumed by protein-match (CDS-directed translation)
    ['topology'],   // top-level, beside sequence.topology — SmartResultRow reads vm.topology
    ['kind'],       // 'catalog' / 'primer' / … — scope filtering depends on it
    ['projectId'],  // parent-visibility bubbling (matchingProjectIds)
  ])('declares %s', (prop) => {
    expect(hasProp('SearchDocument', prop)).toBe(true);
  });
});

describe('search-types — occurrence identity and ownership (the K3.0 contract)', () => {
  it('SearchLocation does NOT declare targetKey — no producer has ever set it', () => {
    expect(hasProp('SearchLocation', 'targetKey')).toBe(false);
  });

  it('SearchLocation declares the fields every engine really emits', () => {
    for (const p of ['segments', 'strand', 'wrapsOrigin']) {
      expect(hasProp('SearchLocation', p)).toBe(true);
    }
  });

  it('ProviderOccurrence exists and has NO targetRef — a provider never names the owner', () => {
    const block = typedefBlock('ProviderOccurrence');
    expect(block).toBeTruthy();
    expect(hasProp('ProviderOccurrence', 'location')).toBe(true);
    expect(hasProp('ProviderOccurrence', 'targetRef')).toBe(false);
  });

  it('SearchOccurrence DOES carry targetRef — the orchestrator adds it', () => {
    expect(hasProp('SearchOccurrence', 'targetRef')).toBe(true);
  });

  it('SearchOccurrence.location is OPTIONAL — a metadata occurrence is just the owner ref', () => {
    // library-search::entryOcc builds `{ targetRef }` with no location for name/tag/status hits.
    expect(isOptional('SearchOccurrence', 'location')).toBe(true);
    expect(isOptional('SearchOccurrence', 'targetRef')).toBe(false);
  });
});

describe('search-types — session and result fields the facade really sets', () => {
  it('SeqMetrics declares length (sequence-search-bio emits it; search-result-format reads it)', () => {
    expect(hasProp('SeqMetrics', 'length')).toBe(true);
  });

  it('SearchMatch.dimension includes enzyme', () => {
    expect(typedefBlock('SearchMatch')).toMatch(/'enzyme'/);
  });

  it('SearchResult declares providerPending (library-search sets it on every result)', () => {
    expect(hasProp('SearchResult', 'providerPending')).toBe(true);
  });

  it('SearchSession.status is the REAL union: partial | done | blocked', () => {
    const block = typedefBlock('SearchSession');
    for (const s of ["'partial'", "'done'", "'blocked'"]) expect(block).toContain(s);
    // …and not the invented ones that never existed at runtime
    expect(block).not.toMatch(/'idle'|'running'|'stale'/);
  });

  it.each([
    ['blocked'], ['incomplete'], ['incompleteDims'], ['providerFailures'],
    ['matchingEntryIds'], ['matchingProjectIds'],
  ])('SearchSession declares %s', (prop) => {
    expect(hasProp('SearchSession', prop)).toBe(true);
  });
});

describe('search-types — QueryFilter', () => {
  it('id is OPTIONAL: transitional/inferred filters legitimately have none', () => {
    expect(isOptional('QueryFilter', 'id')).toBe(true);
    expect(hasProp('QueryFilter', 'id')).toBe(true);
  });
});

// A contract nobody can break silently: removing ANY required field must go red.
describe('search-types — the guard itself', () => {
  it('each required field is asserted individually, so one deletion fails one test', () => {
    expect(hasProp('SearchSession', 'providerFailures')).toBe(true);
    expect(hasProp('SearchSession', 'definitelyNotAField')).toBe(false); // the matcher can say no
  });

  it('an unknown typedef throws rather than passing vacuously', () => {
    expect(() => typedefBlock('NoSuchTypedef')).toThrow(/not found/);
  });
});
