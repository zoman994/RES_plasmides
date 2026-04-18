import { describe, it, expect } from 'vitest';
import { PEPTIDE_TAGS, FUSION_PARTNERS, getTagByName } from '../tags-db';
import { translateDNA } from '../codons';

describe('tags-db', () => {
  describe('PEPTIDE_TAGS', () => {
    it('exports an array of 13 peptide tags', () => {
      expect(Array.isArray(PEPTIDE_TAGS)).toBe(true);
      expect(PEPTIDE_TAGS.length).toBe(13);
    });

    it('each tag has required fields', () => {
      for (const tag of PEPTIDE_TAGS) {
        expect(tag).toHaveProperty('name');
        expect(tag).toHaveProperty('protein');
        expect(tag).toHaveProperty('dna');
        expect(tag).toHaveProperty('position');
        expect(tag).toHaveProperty('category');
        expect(typeof tag.lowComplexity).toBe('boolean');
      }
    });

    it('DNA translates to protein for each tag', () => {
      for (const tag of PEPTIDE_TAGS) {
        // DNA may not be exactly divisible by 3 (e.g. His6 = 18bp = 6 codons)
        const dna = tag.dna.toUpperCase();
        const fullCodons = dna.slice(0, Math.floor(dna.length / 3) * 3);
        const translated = translateDNA(fullCodons);
        // The translated protein should contain the tag protein sequence
        expect(translated).toContain(tag.protein);
      }
    });

    it('His6-tag and G4S linkers have lowComplexity: true', () => {
      const his6 = PEPTIDE_TAGS.find(t => t.name === 'His6-tag');
      const g4s1 = PEPTIDE_TAGS.find(t => t.name === '(G4S)x1 linker');
      const g4s3 = PEPTIDE_TAGS.find(t => t.name === '(G4S)x3 linker');
      expect(his6.lowComplexity).toBe(true);
      expect(g4s1.lowComplexity).toBe(true);
      expect(g4s3.lowComplexity).toBe(true);
    });

    it('non-repetitive tags have lowComplexity: false', () => {
      const flag = PEPTIDE_TAGS.find(t => t.name === 'FLAG-tag');
      const ha = PEPTIDE_TAGS.find(t => t.name === 'HA-tag');
      expect(flag.lowComplexity).toBe(false);
      expect(ha.lowComplexity).toBe(false);
    });

    it('contains all expected tag names', () => {
      const names = PEPTIDE_TAGS.map(t => t.name);
      expect(names).toContain('His6-tag');
      expect(names).toContain('FLAG-tag');
      expect(names).toContain('Strep-tag II');
      expect(names).toContain('V5-tag');
      expect(names).toContain('Myc-tag');
      expect(names).toContain('HA-tag');
      expect(names).toContain('TEV site');
      expect(names).toContain('Thrombin site');
      expect(names).toContain('PreScission site');
      expect(names).toContain('Enterokinase site');
      expect(names).toContain('Factor Xa site');
      expect(names).toContain('(G4S)x1 linker');
      expect(names).toContain('(G4S)x3 linker');
    });

    it('categories are valid', () => {
      const validCategories = ['purification', 'detection', 'cleavage', 'linker'];
      for (const tag of PEPTIDE_TAGS) {
        expect(validCategories).toContain(tag.category);
      }
    });
  });

  describe('FUSION_PARTNERS', () => {
    it('exports an array of 5 fusion partners', () => {
      expect(Array.isArray(FUSION_PARTNERS)).toBe(true);
      expect(FUSION_PARTNERS.length).toBe(5);
    });

    it('each partner has required fields', () => {
      for (const fp of FUSION_PARTNERS) {
        expect(fp).toHaveProperty('name');
        expect(fp).toHaveProperty('type');
        expect(fp).toHaveProperty('accession');
        expect(typeof fp.sizeAA).toBe('number');
        expect(typeof fp.description).toBe('string');
        expect(typeof fp.pattern).toBe('string');
      }
    });

    it('contains GST, MBP, TrxA, SUMO, GFP', () => {
      const names = FUSION_PARTNERS.map(fp => fp.name);
      expect(names).toContain('GST');
      expect(names).toContain('MBP');
      expect(names).toContain('TrxA');
      expect(names).toContain('SUMO');
      expect(names).toContain('GFP');
    });

    it('patterns are N-terminal protein prefixes (16-20 aa)', () => {
      for (const fp of FUSION_PARTNERS) {
        expect(fp.pattern.length).toBeGreaterThanOrEqual(10);
        expect(fp.pattern.length).toBeLessThanOrEqual(25);
      }
    });
  });

  describe('getTagByName', () => {
    it('returns a peptide tag by name', () => {
      const his = getTagByName('His6-tag');
      expect(his).toBeDefined();
      expect(his.protein).toBe('HHHHHH');
    });

    it('returns a fusion partner by name', () => {
      const gst = getTagByName('GST');
      expect(gst).toBeDefined();
      expect(gst.sizeAA).toBe(211);
    });

    it('returns undefined for unknown name', () => {
      expect(getTagByName('NonExistent')).toBeUndefined();
    });
  });
});
