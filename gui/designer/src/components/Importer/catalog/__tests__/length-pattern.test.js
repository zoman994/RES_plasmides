/**
 * Sprint M-B.2 K2 — CatalogColumn length-pattern + filter unit tests.
 */
import { describe, it, expect } from 'vitest';
import { parseLengthPattern, applyCatalogFilter } from '../length-pattern';

describe('M-B.2 K2 — length-pattern', () => {
  it('1) parseLengthPattern recognises >Nk / <N / N-N forms', () => {
    expect(parseLengthPattern('>5kb')).toEqual({ min: 5000 });
    expect(parseLengthPattern('> 5 kb')).toEqual({ min: 5000 });
    expect(parseLengthPattern('<2k')).toEqual({ max: 2000 });
    expect(parseLengthPattern('< 200')).toEqual({ max: 200 });
    expect(parseLengthPattern('2k-3k')).toEqual({ min: 2000, max: 3000 });
    expect(parseLengthPattern('100-500')).toEqual({ min: 100, max: 500 });
    expect(parseLengthPattern('plain query')).toBe(null);
    expect(parseLengthPattern('')).toBe(null);
  });

  it('2) applyCatalogFilter happy path: text match in name OR description', () => {
    const items = [
      { name: 'pUC19', description: 'cloning vector' },
      { name: 'pET28a', description: 'expression vector' },
      { name: 'sfGFP', description: 'reporter' },
    ];
    expect(applyCatalogFilter(items, 'puc').map(i => i.name)).toEqual(['pUC19']);
    expect(applyCatalogFilter(items, 'vector').map(i => i.name).sort()).toEqual(['pET28a', 'pUC19']);
    expect(applyCatalogFilter(items, '').length).toBe(3);
  });

  it('3) applyCatalogFilter respects length pattern when query parses as one', () => {
    const items = [
      { name: 'small', length: 1500 },
      { name: 'medium', length: 4000 },
      { name: 'big', length: 7500 },
    ];
    expect(applyCatalogFilter(items, '>5k').map(i => i.name)).toEqual(['big']);
    expect(applyCatalogFilter(items, '<2k').map(i => i.name)).toEqual(['small']);
    expect(applyCatalogFilter(items, '3k-5k').map(i => i.name)).toEqual(['medium']);
  });
});
