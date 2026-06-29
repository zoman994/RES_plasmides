/**
 * fragment-card-info — CANVAS-CLICK-1. Pins the at-a-glance fragment summary an
 * engineer reads when clicking a card: name / length / topology / acquisition /
 * ends / features. Pure projection of a canvas container.
 */
import { describe, it, expect } from 'vitest';
import { fragmentCardInfo } from '../fragment-card-info';

describe('fragmentCardInfo', () => {
  it('RE digest fragment: name, bp, linear, acquisition, sticky end from _stagger, features', () => {
    const c = {
      name: 'insert_EcoRI', sequence: 'ACGT'.repeat(50), topology: { circular: false },
      origin: { kind: 'cut' }, _role: 'fragment',
      _stagger: { left: { label: '5′ AATT' }, right: null }, // blunt right → terminalStagger null
      annotations: [
        { level: 'region', type: 'CDS', name: 'cbhI' },
        { level: 'detail', type: 'domain', name: 'CBM' }, // not a region → not counted
      ],
    };
    const r = fragmentCardInfo(c);
    expect(r.name).toBe('insert_EcoRI');
    expect(r.lengthBp).toBe(200);
    expect(r.topology).toBe('linear');
    expect(r.acquisition).toBe('рестрикция (дайджест)');
    expect(r.ends).toEqual(['5′ AATT']);
    expect(r.featureCount).toBe(1);
    expect(r.featureNames).toEqual(['cbhI']);
    expect(r.role).toBe('fragment');
  });

  it('PCR fragment → acquisition «ПЦР»', () => {
    const r = fragmentCardInfo({ name: 'amp', sequence: 'AC'.repeat(100), origin: { kind: 'pcr' }, _role: 'fragment' });
    expect(r.acquisition).toBe('ПЦР');
    expect(r.lengthBp).toBe(200);
  });

  it('circular product → topology circular, no ends, role product', () => {
    const r = fragmentCardInfo({
      name: 'Сборка 1 (плазмида)', sequence: 'A'.repeat(1416), topology: { circular: true },
      origin: { kind: 'ligate' }, _role: 'product', annotations: [],
    });
    expect(r.topology).toBe('circular');
    expect(r.acquisition).toBe('лигирование');
    expect(r.ends).toEqual([]);
    expect(r.role).toBe('product');
  });

  it('source plasmid (no origin.kind) → acquisition falls back to role «источник»', () => {
    const r = fragmentCardInfo({
      name: 'pUC19', sequence: 'A'.repeat(2686), topology: { circular: true }, _role: 'source',
    });
    expect(r.acquisition).toBe('источник');
    expect(r.topology).toBe('circular');
  });

  it('ends from container.ends model (no _stagger): 5overhang + blunt', () => {
    const r = fragmentCardInfo({
      name: 'f', sequence: 'ACGTACGT', _role: 'fragment',
      ends: { fivePrime: { type: '5overhang', overhang: 'AATT' }, threePrime: { type: 'blunt' } },
    });
    expect(r.ends).toEqual(['5′ AATT', 'тупой']);
  });

  it('reversed flag surfaced; length falls back to .length when no sequence', () => {
    const r = fragmentCardInfo({ name: 'rc', length: 120, _reversed: true, _role: 'fragment' });
    expect(r.reversed).toBe(true);
    expect(r.lengthBp).toBe(120);
  });

  it('null container → null', () => {
    expect(fragmentCardInfo(null)).toBeNull();
  });
});
