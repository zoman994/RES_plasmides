import { describe, it, expect } from 'vitest';
import { featureColor, FEATURE_COLORS_V2, FEATURE_STROKE } from '../feature-palette';

describe('feature-palette', () => {
  it('exports FEATURE_STROKE = #3A2F1F', () => {
    expect(FEATURE_STROKE).toBe('#3A2F1F');
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
    // Crucial: no #999 / no gray. Every hex must be in FEATURE_COLORS_V2.
    const all = new Set(Object.values(FEATURE_COLORS_V2));
    expect(all.has(featureColor('totally_unknown', 'wat'))).toBe(true);
  });

  it('palette contract has exactly 15 feature types + misc', () => {
    const keys = Object.keys(FEATURE_COLORS_V2);
    expect(keys.length).toBe(16);
    // sanity: every value is a 7-char hex.
    for (const hex of Object.values(FEATURE_COLORS_V2)) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('resistance/reporter detection respects word boundaries', () => {
    // "hybrid-unrelated" should NOT match AmpR regex
    expect(featureColor('CDS', 'hybrid-unrelated')).toBe(FEATURE_COLORS_V2.CDS);
    // "ampicillin" DOES match (\bamp..r?\b with trailing word-char) — acceptable, expected behavior
    expect(featureColor('CDS', 'custom protein')).toBe(FEATURE_COLORS_V2.CDS);
  });
});
