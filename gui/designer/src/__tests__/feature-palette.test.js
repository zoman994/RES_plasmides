import { describe, it, expect } from 'vitest';
import {
  featureColor, featureColorShaded,
  canonicalFeatureKey, shadeFromName,
  FEATURE_COLORS_V2, FEATURE_STROKE,
} from '../feature-palette';

describe('feature-palette — base color (M-B.2 v2: warm sepia + 4 fixes)', () => {
  it('exports FEATURE_STROKE = #3A2F1F', () => {
    expect(FEATURE_STROKE).toBe('#3A2F1F');
  });

  it('updated base hex matches A+ v2 palette', () => {
    expect(FEATURE_COLORS_V2.CDS).toBe('#B0C84A');         // brighter green
    expect(FEATURE_COLORS_V2.promoter).toBe('#FFC400');     // saturated amber
    expect(FEATURE_COLORS_V2.resistance).toBe('#D9836B');   // coral
    expect(FEATURE_COLORS_V2.reporter).toBe('#5DA5C4');     // sky-cyan
    // Other keys unchanged.
    expect(FEATURE_COLORS_V2.ori).toBe('#E8B333');
    expect(FEATURE_COLORS_V2.terminator).toBe('#D97B3B');
  });

  it('resolves direct type keys', () => {
    expect(featureColor('promoter')).toBe(FEATURE_COLORS_V2.promoter);
    expect(featureColor('ori')).toBe(FEATURE_COLORS_V2.ori);
    expect(featureColor('terminator')).toBe(FEATURE_COLORS_V2.terminator);
    expect(featureColor('operator')).toBe(FEATURE_COLORS_V2.operator);
    expect(featureColor('enhancer')).toBe(FEATURE_COLORS_V2.enhancer);
  });

  it('resolves GenBank-style aliases case-insensitively', () => {
    expect(featureColor('promotor')).toBe(FEATURE_COLORS_V2.promoter);
    expect(featureColor('rep_origin')).toBe(FEATURE_COLORS_V2.ori);
    expect(featureColor('RBS')).toBe(FEATURE_COLORS_V2.signal);
    expect(featureColor('sig_peptide')).toBe(FEATURE_COLORS_V2.signal);
    expect(featureColor('primer_binding_site')).toBe(FEATURE_COLORS_V2.primer_bind);
    expect(featureColor('LTR')).toBe(FEATURE_COLORS_V2.LTR);
    expect(featureColor('long_terminal_repeat')).toBe(FEATURE_COLORS_V2.LTR);
    expect(featureColor('RRE')).toBe(FEATURE_COLORS_V2.enhancer);
  });

  it('differentiates protein_bind by name (CAP/CRP/GATA → cap, else operator)', () => {
    expect(featureColor('protein_bind', 'CAP binding site')).toBe(FEATURE_COLORS_V2.cap);
    expect(featureColor('protein_bind', 'CRP')).toBe(FEATURE_COLORS_V2.cap);
    expect(featureColor('protein_bind', 'GATA-1')).toBe(FEATURE_COLORS_V2.cap);
    expect(featureColor('protein_bind', 'lac operator')).toBe(FEATURE_COLORS_V2.operator);
    expect(featureColor('CAP_binding_site', 'CAP')).toBe(FEATURE_COLORS_V2.cap);
  });

  it('refines CDS by name: resistance vs reporter vs his vs tag vs linker vs generic', () => {
    expect(featureColor('CDS', 'AmpR')).toBe(FEATURE_COLORS_V2.resistance);
    expect(featureColor('CDS', 'KanR')).toBe(FEATURE_COLORS_V2.resistance);
    expect(featureColor('CDS', 'HygR')).toBe(FEATURE_COLORS_V2.resistance);
    expect(featureColor('CDS', 'GFP')).toBe(FEATURE_COLORS_V2.reporter);
    expect(featureColor('CDS', 'mCherry')).toBe(FEATURE_COLORS_V2.reporter);
    expect(featureColor('CDS', 'lacZ')).toBe(FEATURE_COLORS_V2.reporter);
    expect(featureColor('CDS', '6×His')).toBe(FEATURE_COLORS_V2.his);
    expect(featureColor('CDS', 'GST')).toBe(FEATURE_COLORS_V2.his);
    expect(featureColor('CDS', '3×FLAG')).toBe(FEATURE_COLORS_V2.tag);
    expect(featureColor('CDS', 'HA-tag')).toBe(FEATURE_COLORS_V2.tag);
    expect(featureColor('CDS', 'GS-linker')).toBe(FEATURE_COLORS_V2.linker);
    expect(featureColor('CDS', 'TEV')).toBe(FEATURE_COLORS_V2.linker);
    expect(featureColor('CDS', 'lacI')).toBe(FEATURE_COLORS_V2.CDS);
    expect(featureColor('gene', 'rop')).toBe(FEATURE_COLORS_V2.CDS);
  });

  it('falls back to misc (ivory) for unknown/empty type — never gray', () => {
    expect(featureColor('misc_feature')).toBe(FEATURE_COLORS_V2.misc);
    expect(featureColor('unknown')).toBe(FEATURE_COLORS_V2.misc);
    expect(featureColor('')).toBe(FEATURE_COLORS_V2.misc);
    expect(featureColor(undefined)).toBe(FEATURE_COLORS_V2.misc);
    expect(featureColor(null)).toBe(FEATURE_COLORS_V2.misc);
    expect(featureColor('some_snapgene_custom_type')).toBe(FEATURE_COLORS_V2.misc);
    const all = new Set(Object.values(FEATURE_COLORS_V2));
    expect(all.has(featureColor('totally_unknown', 'wat'))).toBe(true);
  });

  it('palette contract: 15 core types + 14 fungal detail types + misc', () => {
    // FEAT-COLORS — added 14 dedicated detail/protein-feature hues (intron,
    // signal_peptide, …, stem_loop) so fungal-gene details no longer fall to misc.
    const keys = Object.keys(FEATURE_COLORS_V2);
    expect(keys.length).toBe(30);
    for (const hex of Object.values(FEATURE_COLORS_V2)) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('resistance/reporter detection respects word boundaries', () => {
    expect(featureColor('CDS', 'hybrid-unrelated')).toBe(FEATURE_COLORS_V2.CDS);
    expect(featureColor('CDS', 'custom protein')).toBe(FEATURE_COLORS_V2.CDS);
  });
});

describe('feature-palette — canonicalFeatureKey (synonyms collapse to one shade)', () => {
  it('resistance markers: AmpR / ApR / bla / TEM-1 → bla', () => {
    expect(canonicalFeatureKey('AmpR')).toBe('bla');
    expect(canonicalFeatureKey('ApR')).toBe('bla');
    expect(canonicalFeatureKey('bla')).toBe('bla');
    expect(canonicalFeatureKey('β-lactamase')).toBe('bla');
    expect(canonicalFeatureKey('beta-lactamase')).toBe('bla');
    expect(canonicalFeatureKey('TEM-1')).toBe('bla');
  });

  it('KanR / NeoR / nptII → nptII', () => {
    expect(canonicalFeatureKey('KanR')).toBe('nptII');
    expect(canonicalFeatureKey('NeoR')).toBe('nptII');
    expect(canonicalFeatureKey('nptII')).toBe('nptII');
    expect(canonicalFeatureKey('aphA')).toBe('nptII');
  });

  it('promoters: lac promoter / lacP / P_lac → lac_p', () => {
    expect(canonicalFeatureKey('lac promoter')).toBe('lac_p');
    expect(canonicalFeatureKey('lacP')).toBe('lac_p');
    expect(canonicalFeatureKey('P_lac')).toBe('lac_p');
  });

  it('T7 / CMV / EF1a promoter families', () => {
    expect(canonicalFeatureKey('T7 promoter')).toBe('T7_p');
    expect(canonicalFeatureKey('P_T7')).toBe('T7_p');
    expect(canonicalFeatureKey('CMV promoter')).toBe('CMV_p');
    expect(canonicalFeatureKey('hCMV')).toBe('CMV_p');
    expect(canonicalFeatureKey('EF1a')).toBe('EF1a_p');
    expect(canonicalFeatureKey('EF1α')).toBe('EF1a_p');
  });

  it('origins: pUC ori / ColE1 / pBR322 ori → pMB1 (same family)', () => {
    expect(canonicalFeatureKey('pUC ori')).toBe('pMB1');
    expect(canonicalFeatureKey('ColE1')).toBe('pMB1');
    expect(canonicalFeatureKey('pBR322 ori')).toBe('pMB1');
    expect(canonicalFeatureKey('pMB1')).toBe('pMB1');
  });

  it('tags: 6xHis / His6 / HIS-tag → his6', () => {
    expect(canonicalFeatureKey('6xHis')).toBe('his6');
    expect(canonicalFeatureKey('6×His')).toBe('his6');
    expect(canonicalFeatureKey('His6')).toBe('his6');
    expect(canonicalFeatureKey('HIS-tag')).toBe('his6');
  });

  it('reporters: GFP / EGFP / GFPmut → gfp; sfGFP separate', () => {
    expect(canonicalFeatureKey('GFP')).toBe('gfp');
    expect(canonicalFeatureKey('EGFP')).toBe('gfp');
    expect(canonicalFeatureKey('GFPmut3')).toBe('gfp');
    expect(canonicalFeatureKey('sfGFP')).toBe('sfgfp');
    expect(canonicalFeatureKey('mCherry')).toBe('mcherry');
    expect(canonicalFeatureKey('Venus')).toBe('yfp');
  });

  it('returns null for truly unknown features', () => {
    expect(canonicalFeatureKey('mysteryProtein123')).toBe(null);
    expect(canonicalFeatureKey('')).toBe(null);
    expect(canonicalFeatureKey(null)).toBe(null);
    expect(canonicalFeatureKey(undefined)).toBe(null);
  });
});

describe('feature-palette — shadeFromName (deterministic ±20% L / ±18° H)', () => {
  it('returns base hex when name is empty', () => {
    expect(shadeFromName('#B0C84A', '')).toBe('#B0C84A');
    expect(shadeFromName('#B0C84A', null)).toBe('#B0C84A');
    expect(shadeFromName('#B0C84A', undefined)).toBe('#B0C84A');
  });

  it('is deterministic: same name always → same hex', () => {
    const a = shadeFromName('#B0C84A', 'AmpR');
    const b = shadeFromName('#B0C84A', 'AmpR');
    expect(a).toBe(b);
  });

  it('different names produce different shades', () => {
    const a = shadeFromName('#B0C84A', 'lacZα');
    const b = shadeFromName('#B0C84A', 'mCherry');
    const c = shadeFromName('#B0C84A', 'csrA');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('output is always valid hex', () => {
    for (const name of ['AmpR', 'KanR', 'lacZ', 'GFP', 'mCherry', 'pUC ori']) {
      expect(shadeFromName('#B0C84A', name)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('feature-palette — featureColorShaded (canonical-key + shade)', () => {
  it('AmpR and bla collapse to the same shade (one underlying gene)', () => {
    const ampr = featureColorShaded('CDS', 'AmpR');
    const bla = featureColorShaded('CDS', 'bla');
    const tem1 = featureColorShaded('CDS', 'TEM-1');
    expect(ampr).toBe(bla);
    expect(ampr).toBe(tem1);
  });

  it('AmpR and KanR get distinct shades (different underlying genes)', () => {
    const ampr = featureColorShaded('CDS', 'AmpR');
    const kanr = featureColorShaded('CDS', 'KanR');
    expect(ampr).not.toBe(kanr);
  });

  it('lac promoter and lacP get the same shade; T7 promoter is different', () => {
    const lac = featureColorShaded('promoter', 'lac promoter');
    const lacP = featureColorShaded('promoter', 'lacP');
    const t7 = featureColorShaded('promoter', 'T7 promoter');
    expect(lac).toBe(lacP);
    expect(lac).not.toBe(t7);
  });

  it('pUC ori and ColE1 collapse to one shade (pMB1 family)', () => {
    expect(featureColorShaded('rep_origin', 'pUC ori')).toBe(
      featureColorShaded('rep_origin', 'ColE1')
    );
  });

  it('unknown name falls through to raw-name hash; same raw name → same shade', () => {
    const a = featureColorShaded('CDS', 'mysteryProtein');
    const b = featureColorShaded('CDS', 'mysteryProtein');
    const c = featureColorShaded('CDS', 'otherProtein');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('without a name, returns the base color (no shade)', () => {
    expect(featureColorShaded('promoter')).toBe(FEATURE_COLORS_V2.promoter);
    expect(featureColorShaded('CDS')).toBe(FEATURE_COLORS_V2.CDS);
  });

  // FEAT-COLORS — fungal-gene detail types must each get a DEDICATED hue (was all
  // ivory misc → a multi-intron / multi-domain gene looked flat).
  describe('fungal-gene detail types have dedicated colours (not misc)', () => {
    const MISC = FEATURE_COLORS_V2.misc;
    const TYPES = [
      'intron', 'signal_peptide', 'transit_peptide', 'propeptide', 'mat_peptide',
      'domain', 'motif', 'active_site', 'binding', 'disulfide_bond',
      'core_promoter', 'poly_a', 'regulatory', 'stem_loop',
    ];
    it('every fungal detail type resolves to a non-misc colour', () => {
      for (const t of TYPES) {
        expect(featureColor(t), `${t} should not be misc`).not.toBe(MISC);
        expect(featureColor(t)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
    it('intron / signal_peptide / domain / active_site are mutually distinct', () => {
      const c = ['intron', 'signal_peptide', 'domain', 'active_site'].map((t) => featureColor(t));
      expect(new Set(c).size).toBe(4);
    });
    it('still distinct under per-name shading (a named domain ≠ misc)', () => {
      expect(featureColorShaded('domain', 'catalytic')).not.toBe(MISC);
    });
  });
});
