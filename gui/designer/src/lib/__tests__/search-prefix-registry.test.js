/**
 * search-prefix-registry — the ONE source of truth for the query language (REV #2 §5).
 * Parser, serializer, selector menu, chips, help and alias tests all derive from it —
 * a separate UI array + parser regex would inevitably drift.
 */
import { describe, it, expect } from 'vitest';
import {
  PREFIX_REGISTRY, resolvePrefix, canonicalPrefix, prefixEntry, allCanonicalKeys, isExecutablePrefix, selectablePrefixKeys,
} from '../search-prefix-registry';

describe('PREFIX_REGISTRY — shape + coverage', () => {
  it('covers every v1 prefix (§4.1)', () => {
    expect(allCanonicalKeys().sort()).toEqual(
      ['aa', 'cut', 'enz', 'feature', 'in', 'lib', 'mol', 'name', 'primer', 'project', 'seq', 'status', 'tag', 'type'].sort(),
    );
  });
  it('every entry has the required contract fields', () => {
    for (const e of PREFIX_REGISTRY) {
      expect(typeof e.canonical).toBe('string');
      expect(Array.isArray(e.aliases)).toBe(true);
      expect(['scope', 'provider', 'preset', 'field', 'filter']).toContain(e.category);
      expect(typeof e.enabled).toBe('boolean');
    }
  });
});

describe('resolvePrefix / canonicalPrefix — case-insensitive, canonical + aliases (§4.3)', () => {
  it('resolves a canonical key', () => {
    expect(canonicalPrefix('seq')).toBe('seq');
    expect(canonicalPrefix('SEQ')).toBe('seq');
  });
  it('resolves EN aliases', () => {
    expect(canonicalPrefix('dna')).toBe('seq');
    expect(canonicalPrefix('protein')).toBe('aa');
    expect(canonicalPrefix('molecule')).toBe('mol');
    expect(canonicalPrefix('proj')).toBe('project');
  });
  it('resolves RU aliases', () => {
    expect(canonicalPrefix('днк')).toBe('seq');
    expect(canonicalPrefix('белок')).toBe('aa');
    expect(canonicalPrefix('рестриктаза')).toBe('enz');
    expect(canonicalPrefix('фича')).toBe('feature');
  });
  it('re: is a legacy alias that canonicalizes to cut (§4.4)', () => {
    expect(canonicalPrefix('re')).toBe('cut');
    expect(resolvePrefix('re').canonical).toBe('cut');
  });
  it('unknown prefix → null', () => {
    expect(canonicalPrefix('http')).toBeNull();
    expect(resolvePrefix('nope')).toBeNull();
    expect(canonicalPrefix('')).toBeNull();
  });
  it('prefixEntry returns the entry by canonical', () => {
    expect(prefixEntry('cut').providerIntent).toBe('restrictionSites');
    expect(prefixEntry('name').field).toBe('name');
  });
});

// §13.7: aliases unique (case-insensitive) and never collide with any canonical key.
describe('registry invariants (§13.7)', () => {
  it('no alias collides with another alias or a canonical key (case-insensitive)', () => {
    const seen = new Map();
    for (const e of PREFIX_REGISTRY) {
      const keys = [e.canonical, ...e.aliases].map((k) => k.toLowerCase());
      for (const k of keys) {
        expect(seen.has(k)).toBe(false); // duplicate token
        seen.set(k, e.canonical);
      }
    }
  });
  it('reserved forms are NOT registered (§4.2): no `pr`, no `gene`', () => {
    // NB §4.1 explicitly lists the RU `в:` (single Cyrillic char) for `in:`; the §4.2
    // «no single-letter» guidance targets name-colliding Latin abbreviations, not it.
    const all = new Set([...PREFIX_REGISTRY.flatMap((e) => [e.canonical, ...e.aliases])].map((k) => k.toLowerCase()));
    expect(all.has('pr')).toBe(false);
    expect(all.has('gene')).toBe(false);
  });
  it('field / filter entries name their fieldClause field', () => {
    for (const e of PREFIX_REGISTRY) {
      if (e.category === 'field' || e.category === 'filter') expect(typeof e.field).toBe('string');
    }
  });
});

// Parametrized: every canonical AND every EN/RU alias resolves — in any case — to its
// canonical, in both directions (§13.7).
describe('registry — parametrized canonical + alias resolution', () => {
  const cases = PREFIX_REGISTRY.flatMap((e) => [e.canonical, ...e.aliases].map((token) => [token, e.canonical]));
  it.each(cases)('«%s» → canonical «%s» (lower / UPPER / Mixed)', (token, canonical) => {
    expect(canonicalPrefix(token)).toBe(canonical);
    expect(canonicalPrefix(token.toUpperCase())).toBe(canonical);
    expect(canonicalPrefix(token.toLowerCase())).toBe(canonical);
    expect(resolvePrefix(token).canonical).toBe(canonical);
  });
});

// Readiness (§13.7): three separate concerns — parse-known, selectable, executable.
describe('registry — readiness split (§13.7)', () => {
  it('executable prefixes are exactly those the engine consumes today (Stage 2: +enz/mol/primer/project)', () => {
    const executable = PREFIX_REGISTRY.filter((e) => e.readiness === 'executable').map((e) => e.canonical).sort();
    // Stage 2: enz (enzymeCatalog routing), mol/primer/project (scope narrowing) now EXECUTE.
    expect(executable).toEqual(['aa', 'cut', 'enz', 'lib', 'mol', 'primer', 'project', 'seq', 'status', 'tag', 'type'].sort());
  });
  it('not-yet-consumed prefixes are parse-only (recognised, not silently no-op)', () => {
    // name/feature → fieldClauses the engine does not consume yet; in → withinProject (Stage 3+).
    for (const k of ['name', 'feature', 'in']) {
      expect(isExecutablePrefix(k)).toBe(false);
      expect(prefixEntry(k).readiness).toBe('parse-only');
    }
  });
  it('selectable = enabled AND executable — the selector gate, distinct from allCanonicalKeys()', () => {
    const selectable = selectablePrefixKeys();
    // parse-only prefixes are parser-known but NOT selectable
    expect(allCanonicalKeys()).toContain('name');
    expect(selectable).not.toContain('name');
    expect(selectable).not.toContain('feature');
    // every selectable prefix is executable (§13.7: a real provider/adapter behind it)
    for (const k of selectable) expect(isExecutablePrefix(k)).toBe(true);
    expect([...selectable].sort()).toEqual(['aa', 'cut', 'enz', 'lib', 'mol', 'primer', 'project', 'seq', 'status', 'tag', 'type'].sort());
  });
});
