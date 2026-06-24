/**
 * custom-enzymes.js (RS-C1) — pure model for user-defined restriction enzymes
 * + named enzyme sets («наборы рестриктаз»). Validates/normalises a custom
 * enzyme into the SAME shape as restriction-db.js RE_ENZYMES, derives
 * end/overhang from site+cut, ships built-in preset sets, and merges custom
 * enzymes over the 63 built-ins for the scan engine (RS-C2 consumes the merge).
 *
 * Bio-invariant: this is Type II ONLY — never Golden Gate (Type IIS).
 */
import { describe, it, expect } from 'vitest';
import { RE_ENZYMES } from '../../restriction-db.js';
import {
  deriveEndOverhang,
  normalizeCustomEnzyme,
  validateCustomEnzyme,
  BUILTIN_ENZYME_SETS,
  mergeREEnzymes,
  resolveEnzymeSet,
} from '../custom-enzymes.js';

describe('deriveEndOverhang — end/overhang from site + cut', () => {
  it('5′ overhang: fwd < rev → bases between cuts', () => {
    // EcoRI GAATTC cut [1,5] → 5′ AATT
    expect(deriveEndOverhang('GAATTC', [1, 5])).toEqual({ end: '5prime', overhang: 'AATT' });
  });
  it('3′ overhang: fwd > rev → bases between cuts (lo..hi)', () => {
    // PstI CTGCAG cut [5,1] → 3′ TGCA
    expect(deriveEndOverhang('CTGCAG', [5, 1])).toEqual({ end: '3prime', overhang: 'TGCA' });
  });
  it('blunt: fwd === rev → null overhang', () => {
    // EcoRV GATATC cut [3,3] → blunt
    expect(deriveEndOverhang('GATATC', [3, 3])).toEqual({ end: 'blunt', overhang: null });
  });
});

describe('validateCustomEnzyme', () => {
  const good = { name: 'MyRI', site: 'GAATTC', cut: [1, 5] };
  it('accepts a well-formed enzyme', () => {
    expect(validateCustomEnzyme(good).ok).toBe(true);
  });
  it('rejects an empty name', () => {
    const r = validateCustomEnzyme({ ...good, name: '  ' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === 'name')).toBe(true);
  });
  it('rejects a site with non-IUPAC characters', () => {
    const r = validateCustomEnzyme({ ...good, site: 'GAZTTC' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === 'site')).toBe(true);
  });
  it('rejects a too-short site (< 2)', () => {
    expect(validateCustomEnzyme({ ...good, site: 'G' }).ok).toBe(false);
  });
  it('rejects cut positions out of [0, site.length]', () => {
    expect(validateCustomEnzyme({ ...good, cut: [1, 99] }).ok).toBe(false);
    expect(validateCustomEnzyme({ ...good, cut: [-1, 5] }).ok).toBe(false);
  });
  it('rejects non-integer cut', () => {
    expect(validateCustomEnzyme({ ...good, cut: [1.5, 5] }).ok).toBe(false);
  });
  it('accepts IUPAC-ambiguous sites', () => {
    expect(validateCustomEnzyme({ name: 'AmbI', site: 'GTYRAC', cut: [3, 3] }).ok).toBe(true);
  });
});

describe('normalizeCustomEnzyme — produces an RE_ENZYMES-shaped record', () => {
  it('uppercases the site, derives end/overhang, fills defaults, flags isCustom', () => {
    const rec = normalizeCustomEnzyme({ name: ' MyRI ', site: 'gaattc', cut: [1, 5] }, { id: 'e1', createdAt: 'T0' });
    expect(rec.name).toBe('MyRI');
    expect(rec.site).toBe('GAATTC');
    expect(rec.cut).toEqual([1, 5]);
    expect(rec.end).toBe('5prime');
    expect(rec.overhang).toBe('AATT');
    expect(rec.isCustom).toBe(true);
    expect(rec.id).toBe('e1');
    expect(rec.createdAt).toBe('T0');
    expect(rec.temp).toBe(37);
    expect(rec.buffer).toBeTruthy();
    expect(Array.isArray(rec.isoschizomers)).toBe(true);
  });
  it('respects explicit end/overhang/temp/buffer when given', () => {
    const rec = normalizeCustomEnzyme({ name: 'X', site: 'AAAAAA', cut: [3, 3], end: 'blunt', overhang: null, temp: 65, buffer: 'B3' });
    expect(rec.end).toBe('blunt');
    expect(rec.overhang).toBeNull();
    expect(rec.temp).toBe(65);
    expect(rec.buffer).toBe('B3');
  });
});

describe('BUILTIN_ENZYME_SETS — preset sets reference only existing built-ins', () => {
  it('every preset member is a real RE_ENZYMES key (Type II, never GG)', () => {
    expect(BUILTIN_ENZYME_SETS.length).toBeGreaterThanOrEqual(2);
    for (const set of BUILTIN_ENZYME_SETS) {
      expect(set.id).toMatch(/^preset:/);
      expect(set.isPreset).toBe(true);
      expect(set.enzymes.length).toBeGreaterThan(0);
      for (const name of set.enzymes) {
        expect(RE_ENZYMES[name], `${name} in ${set.id}`).toBeTruthy();
      }
    }
  });
  it('ships «Частые», «MCS pUC19», «NEB» and «Thermo Scientific» presets', () => {
    const ids = BUILTIN_ENZYME_SETS.map((s) => s.id);
    expect(ids).toContain('preset:frequent');
    expect(ids).toContain('preset:mcs-puc19');
    expect(ids).toContain('preset:neb');
    expect(ids).toContain('preset:thermo');
  });

  it('NEB preset is derived from the catalog (comprehensive, excludes methylation-only)', () => {
    const neb = BUILTIN_ENZYME_SETS.find((s) => s.id === 'preset:neb');
    expect(neb.enzymes.length).toBeGreaterThan(40); // ~full NEB catalog
    expect(neb.enzymes).toContain('EcoRI');
    expect(neb.enzymes).not.toContain('DpnI'); // methylation-only excluded
    expect(neb.enzymes).not.toContain('MboI');
  });

  it('Thermo preset is a non-empty curated list of real enzymes', () => {
    const thermo = BUILTIN_ENZYME_SETS.find((s) => s.id === 'preset:thermo');
    expect(thermo.enzymes.length).toBeGreaterThan(20);
    expect(thermo.enzymes).toContain('EcoRI');
    expect(thermo.enzymes).toContain('BamHI');
  });
});

describe('mergeREEnzymes — custom enzymes layered over the 63 built-ins', () => {
  it('adds a custom enzyme keyed by name, keeps the built-ins', () => {
    const custom = { c1: normalizeCustomEnzyme({ name: 'MyRI', site: 'GAATTC', cut: [1, 5] }, { id: 'c1' }) };
    const merged = mergeREEnzymes(custom);
    expect(merged.EcoRI).toBeTruthy(); // built-in preserved
    expect(merged.MyRI).toBeTruthy(); // custom added
    expect(merged.MyRI.isCustom).toBe(true);
    expect(Object.keys(merged).length).toBe(Object.keys(RE_ENZYMES).length + 1);
  });
  it('a custom enzyme sharing a built-in name overrides it', () => {
    const custom = { c1: normalizeCustomEnzyme({ name: 'EcoRI', site: 'GAATTC', cut: [1, 5], temp: 99 }, { id: 'c1' }) };
    const merged = mergeREEnzymes(custom);
    expect(merged.EcoRI.temp).toBe(99);
    expect(merged.EcoRI.isCustom).toBe(true);
  });
  it('empty / nullish custom map returns the built-ins unchanged', () => {
    expect(Object.keys(mergeREEnzymes({})).length).toBe(Object.keys(RE_ENZYMES).length);
    expect(Object.keys(mergeREEnzymes(null)).length).toBe(Object.keys(RE_ENZYMES).length);
  });
});

describe('resolveEnzymeSet — set → enzyme names present in the merged dict', () => {
  it('keeps known members, drops unknown ones', () => {
    const merged = mergeREEnzymes({});
    const names = resolveEnzymeSet({ enzymes: ['EcoRI', 'GhostI', 'BamHI'] }, merged);
    expect(names).toEqual(['EcoRI', 'BamHI']);
  });
  it('a preset resolves entirely against the built-ins', () => {
    const merged = mergeREEnzymes({});
    const preset = BUILTIN_ENZYME_SETS.find((s) => s.id === 'preset:frequent');
    expect(resolveEnzymeSet(preset, merged)).toEqual(preset.enzymes);
  });
});
