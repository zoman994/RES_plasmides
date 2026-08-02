/**
 * query-classify — the single smart box auto-classifies the input WITHOUT the user
 * picking a dimension (P1). Multi-intent (a DNA-looking query still searches names),
 * optional prefixes (seq:/aa:/tag:/type:/status:/re:), keyword synonyms → real enum,
 * and explicit ≠ inferred filters («release» in a name must not be silently hidden).
 */
import { describe, it, expect } from 'vitest';
import { classifyQuery } from '../query-classify';

const kinds = (p) => p.interpretations.map((i) => i.kind).sort();

describe('classifyQuery — normalization + empty', () => {
  it('empty / whitespace → no terms, no interpretations', () => {
    const p = classifyQuery('   ');
    expect(p.normalizedText).toBe('');
    expect(p.textTerms).toEqual([]);
    expect(p.interpretations).toEqual([]);
    expect(p.seqQuery).toBeNull();
    expect(p.aaQuery).toBeNull();
  });
  it('collapses whitespace, keeps free terms', () => {
    const p = classifyQuery('  pUC19   glaA  ');
    expect(p.normalizedText).toBe('pUC19 glaA');
    expect(p.textTerms).toEqual(['pUC19', 'glaA']);
    expect(kinds(p)).toEqual(['text']);
  });
});

describe('classifyQuery — multi-intent DNA', () => {
  it('a ≥8 nt ACGT free term is BOTH text and dna (a name can be ATGC…)', () => {
    const p = classifyQuery('GAATTCGGATCCAAGCTT');
    expect(kinds(p)).toEqual(['dna', 'text']);
    expect(p.seqQuery).toBe('GAATTCGGATCCAAGCTT');
    // auto-detected DNA has < 1.0 confidence (still primarily a text token)
    const dna = p.interpretations.find((i) => i.kind === 'dna');
    expect(dna.confidence).toBeLessThan(1);
  });
  it('a degenerate bare token stays TEXT ONLY — never an inferred DNA motif (K3.0 §2.5)', () => {
    // Multi-intent is preserved for A/C/G/T (above): a name really can read ATGC…. But a
    // degenerate token is not a searchable motif for the interactive engine, so inferring DNA
    // from it would manufacture a query the engine must then reject.
    const p = classifyQuery('GAATTCNNNNRYGGATCC');
    expect(kinds(p)).toEqual(['text']);
    expect(p.seqQuery).toBeNull();
  });
  it('short (<8) non-keyword term stays text only', () => {
    const p = classifyQuery('amp');
    expect(kinds(p)).toEqual(['text']);
    expect(p.seqQuery).toBeNull();
  });
});

describe('classifyQuery — explicit prefixes', () => {
  it('seq: → explicit sequence filter + dna interpretation at full confidence', () => {
    const p = classifyQuery('seq:ACGTACGTACGT');
    expect(p.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'sequence', value: 'ACGTACGTACGT' }));
    expect(p.seqQuery).toBe('ACGTACGTACGT');
    expect(p.interpretations.find((i) => i.kind === 'dna').confidence).toBe(1);
  });
  it('aa: → explicit protein filter + protein interpretation (never auto-detected)', () => {
    const p = classifyQuery('aa:MAKRVLAAS');
    expect(p.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'protein', value: 'MAKRVLAAS' }));
    expect(p.aaQuery).toBe('MAKRVLAAS');
    expect(kinds(p)).toContain('protein');
    // a bare AA-looking token WITHOUT aa: must NOT auto-classify as protein
    expect(classifyQuery('MAKRVLAAS').aaQuery).toBeNull();
  });
  it('tag:/re: pass through as explicit filters', () => {
    expect(classifyQuery('tag:gfp').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'tag', value: 'gfp' }));
    expect(classifyQuery('re:EcoRI').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'enzyme', value: 'EcoRI' }));
  });
  it('re: → reQuery field + enzyme interpretation (drives cut-site search, P5)', () => {
    const p = classifyQuery('re:EcoRI');
    expect(p.reQuery).toBe('EcoRI');
    expect(kinds(p)).toContain('enzyme');
    // a bare enzyme-looking token WITHOUT re: is NOT an enzyme query
    expect(classifyQuery('EcoRI').reQuery).toBeNull();
  });
  it('minDnaLen gates AUTO-detected DNA motifs; explicit seq: always wins (REV-1)', () => {
    expect(classifyQuery('ACGTA').seqQuery).toBeNull(); // 5 < default 8 → name, not motif
    expect(classifyQuery('ACGTA', { minDnaLen: 4 }).seqQuery).toBe('ACGTA'); // lowered → motif
    expect(classifyQuery('ACGTACGTAC', { minDnaLen: 12 }).seqQuery).toBeNull(); // raised → name only
    expect(classifyQuery('seq:ACG', { minDnaLen: 12 }).seqQuery).toBe('ACG'); // explicit overrides
  });
  it('type:/status: normalize RU/EN synonyms → real enum', () => {
    expect(classifyQuery('type:кольцевая').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'type', value: 'circular' }));
    expect(classifyQuery('type:primer').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'type', value: 'primer' }));
    expect(classifyQuery('status:верифицированная').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'status', value: 'release' }));
    expect(classifyQuery('status:draft').explicitFilters).toContainEqual(expect.objectContaining({ dim: 'status', value: 'wip' }));
  });
});

describe('classifyQuery — inferred filters (removable, NOT hard)', () => {
  it('a free keyword becomes a REMOVABLE inferred filter AND stays a text term', () => {
    const p = classifyQuery('circular');
    expect(p.inferredFilters).toContainEqual({ dim: 'type', value: 'circular', removable: true });
    // explicit ≠ inferred: the literal term is kept so an entry NAMED "circular" still matches
    expect(p.textTerms).toContain('circular');
    expect(p.explicitFilters).toEqual([]);
  });
  it('RU status keyword inferred → removable, term kept', () => {
    const p = classifyQuery('устаревшая');
    expect(p.inferredFilters).toContainEqual({ dim: 'status', value: 'deprecated', removable: true });
    expect(p.textTerms).toContain('устаревшая');
  });
});
