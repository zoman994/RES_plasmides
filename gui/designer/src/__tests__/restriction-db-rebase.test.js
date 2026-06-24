/**
 * REBASE catalog expansion — RE_ENZYMES is the full commercial Type IIP set from
 * REBASE (~459) merged with the curated 62. Verifies breadth, the curated-wins
 * merge, Type IIS exclusion (bio-invariant), cut-site accuracy, and the
 * data-driven NEB/Thermo presets.
 */
import { describe, it, expect } from 'vitest';
import { RE_ENZYMES, supplierNames } from '../restriction-db.js';
import { GG_ENZYMES as GG } from '../golden-gate.js';
import { BUILTIN_ENZYME_SETS, deriveEndOverhang } from '../lib/custom-enzymes.js';

describe('REBASE catalog', () => {
  it('has the full commercial catalog (>400 enzymes)', () => {
    expect(Object.keys(RE_ENZYMES).length).toBeGreaterThan(400);
  });

  it('includes REBASE-only enzymes AND keeps curated lab metadata', () => {
    expect(RE_ENZYMES.AatII).toBeTruthy(); // REBASE-only
    expect(RE_ENZYMES.AatII.source).toBe('REBASE');
    // curated EcoRI keeps its hand-maintained buffer, gains REBASE supplier codes
    expect(RE_ENZYMES.EcoRI.buffer).toBe('CutSmart');
    expect(RE_ENZYMES.EcoRI.suppliers).toContain('N');
  });

  it('EXCLUDES Type IIS enzymes — they stay in Golden Gate (bio-invariant Rule 1)', () => {
    for (const iis of ['BsaI', 'BsmBI', 'BpiI', 'SapI', 'BtgZI']) {
      expect(RE_ENZYMES[iis], `${iis} must NOT be in RE_ENZYMES`).toBeFalsy();
    }
    expect(GG.BsaI).toBeTruthy(); // still in golden-gate.js
  });

  it('cut sites are accurate (REBASE == our derive convention)', () => {
    const check = (name, site, cut, end, oh) => {
      expect(RE_ENZYMES[name].site).toBe(site);
      expect(RE_ENZYMES[name].cut).toEqual(cut);
      expect(deriveEndOverhang(site, cut)).toEqual({ end, overhang: oh });
    };
    check('EcoRI', 'GAATTC', [1, 5], '5prime', 'AATT');
    check('PstI', 'CTGCAG', [5, 1], '3prime', 'TGCA');
    check('NotI', 'GCGGCCGC', [2, 6], '5prime', 'GGCC');
    check('EcoRV', 'GATATC', [3, 3], 'blunt', null);
  });

  it('NEB / Thermo presets are data-driven from supplier codes (N / B)', () => {
    const neb = BUILTIN_ENZYME_SETS.find((s) => s.id === 'preset:neb');
    const thermo = BUILTIN_ENZYME_SETS.find((s) => s.id === 'preset:thermo');
    expect(neb.enzymes.length).toBeGreaterThan(100);
    expect(thermo.enzymes.length).toBeGreaterThan(80);
    // every member actually carries that supplier code
    expect(neb.enzymes.every((n) => RE_ENZYMES[n].suppliers.includes('N'))).toBe(true);
    expect(thermo.enzymes.every((n) => RE_ENZYMES[n].suppliers.includes('B'))).toBe(true);
  });

  it('supplierNames resolves REBASE codes to readable names', () => {
    expect(supplierNames(['N', 'B', 'R'])).toEqual(['New England Biolabs', 'Thermo Fisher Scientific', 'Promega']);
    expect(supplierNames(['Z'])).toEqual(['Z']); // unknown code passes through
    expect(supplierNames(null)).toEqual([]);
  });
});
