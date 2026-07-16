/**
 * search-enzyme-adapters — the restriction catalog as searchable SearchDocuments
 * (P5). Split out of search-document-adapters so the ~459-enzyme restriction DB
 * is NOT dragged into every consumer of entryToDocument (library-search, the tree
 * filter, the assembly picker via makeEntryMatcher, the align lazy chunk).
 */
import { describe, it, expect } from 'vitest';
import { collectEnzymeDocuments } from '../search-enzyme-adapters';

describe('collectEnzymeDocuments — restriction catalog as searchable entities (P5)', () => {
  const docs = collectEnzymeDocuments();
  it('surfaces enzymes as ref.kind=enzyme docs (name matchable), no sequence', () => {
    const ecoRI = docs.find((d) => d.ref.id === 'EcoRI');
    expect(ecoRI).toBeDefined();
    expect(ecoRI.ref.kind).toBe('enzyme');
    expect(ecoRI.title).toBe('EcoRI');
    expect(ecoRI.textFields.name).toBe('EcoRI');
    expect(ecoRI.sequence).toBeUndefined(); // metadata-only, cut-site dims skip it
  });
  it('carries the recognition site as subtitle + a searchable tag', () => {
    const ecoRI = docs.find((d) => d.ref.id === 'EcoRI');
    expect(ecoRI.subtitle).toBe('GAATTC');
    expect(ecoRI.textFields.tags).toContain('GAATTC');
  });
});
