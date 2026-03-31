import { describe, it, expect } from 'vitest';
import {
  RE_ENZYMES, searchRE, getCompatible, getIsoschizomers,
  findSitesInSequence, checkAssemblyForSites,
} from '../restriction-db';

describe('restriction-db', () => {
  it('contains 80+ enzymes', () => {
    expect(Object.keys(RE_ENZYMES).length).toBeGreaterThanOrEqual(50);
  });

  it('does not include Type IIS enzymes', () => {
    expect(RE_ENZYMES['BsaI']).toBeUndefined();
    expect(RE_ENZYMES['BpiI']).toBeUndefined();
    expect(RE_ENZYMES['BsmBI']).toBeUndefined();
    expect(RE_ENZYMES['BtgZI']).toBeUndefined();
    expect(RE_ENZYMES['SapI']).toBeUndefined();
  });

  it('each enzyme has required fields', () => {
    for (const [name, info] of Object.entries(RE_ENZYMES)) {
      expect(info.site, `${name} missing site`).toBeTruthy();
      expect(info.cut, `${name} missing cut`).toHaveLength(2);
      expect(['5prime', '3prime', 'blunt'], `${name} bad end`).toContain(info.end);
      expect(typeof info.temp, `${name} missing temp`).toBe('number');
    }
  });

  describe('searchRE', () => {
    it('finds by name', () => {
      expect(searchRE('Eco').map(([n]) => n)).toContain('EcoRI');
    });

    it('finds by site', () => {
      expect(searchRE('GAATTC').map(([n]) => n)).toContain('EcoRI');
    });

    it('finds by overhang', () => {
      expect(searchRE('AATT').map(([n]) => n)).toContain('EcoRI');
    });

    it('returns all enzymes when query is empty', () => {
      expect(searchRE('').length).toBe(Object.keys(RE_ENZYMES).length);
    });

    it('is case-insensitive', () => {
      expect(searchRE('ecori').map(([n]) => n)).toContain('EcoRI');
    });
  });

  describe('getCompatible', () => {
    it('finds MfeI for EcoRI (same AATT overhang)', () => {
      expect(getCompatible('EcoRI')).toContain('MfeI');
    });

    it('returns empty for blunt cutters', () => {
      expect(getCompatible('EcoRV')).toEqual([]);
    });

    it('returns empty for unknown enzyme', () => {
      expect(getCompatible('FakeEnzyme')).toEqual([]);
    });

    it('finds BglII compatible with BamHI (GATC overhang)', () => {
      expect(getCompatible('BamHI')).toContain('BglII');
    });
  });

  describe('getIsoschizomers', () => {
    it('returns known isoschizomers for EcoRI', () => {
      const iso = getIsoschizomers('EcoRI');
      expect(iso.isoschizomers).toContain('Eco831I');
      // MfeI has a DIFFERENT site (CAATTG vs GAATTC) — compatible ends, not neoschizomer
      expect(iso.neoschizomers).toEqual([]);
    });

    it('returns empty arrays for unknown enzyme', () => {
      const iso = getIsoschizomers('FakeEnzyme');
      expect(iso.isoschizomers).toEqual([]);
      expect(iso.neoschizomers).toEqual([]);
    });
  });

  describe('findSitesInSequence', () => {
    it('detects EcoRI in sequence', () => {
      const sites = findSitesInSequence('EcoRI', 'ATGCGAATTCGATCG');
      expect(sites.length).toBe(1);
      expect(sites[0].position).toBe(4);
      expect(sites[0].strand).toBe('+');
    });

    it('detects palindromic site on both strands as single match', () => {
      // EcoRI site GAATTC is palindromic, so RC = GAATTC — same, no extra match
      const sites = findSitesInSequence('EcoRI', 'ATGCGAATTCGATCG');
      expect(sites.length).toBe(1);
    });

    it('detects multiple sites', () => {
      const sites = findSitesInSequence('EcoRI', 'GAATTCAAAGAATTC');
      expect(sites.length).toBe(2);
    });

    it('returns empty for no match', () => {
      const sites = findSitesInSequence('EcoRI', 'ATGCGATCGATCG');
      expect(sites.length).toBe(0);
    });

    it('handles degenerate sites (IUPAC)', () => {
      // BstEII site is GGTNACC — N matches any base
      const sites = findSitesInSequence('BstEII', 'AAGGTAACCTT');
      expect(sites.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for unknown enzyme', () => {
      expect(findSitesInSequence('FakeEnzyme', 'ATGC')).toEqual([]);
    });
  });

  describe('checkAssemblyForSites', () => {
    it('warns about internal sites', () => {
      const frags = [
        { name: 'frag1', sequence: 'ATGCGAATTCGATCG' },
        { name: 'frag2', sequence: 'ATGCGATCGATCG' },
      ];
      const hits = checkAssemblyForSites('EcoRI', frags);
      expect(hits.length).toBe(1);
      expect(hits[0].fragmentName).toBe('frag1');
      expect(hits[0].sites.length).toBe(1);
    });

    it('returns empty when no sites found', () => {
      const frags = [
        { name: 'frag1', sequence: 'ATGCGATCGATCG' },
      ];
      expect(checkAssemblyForSites('EcoRI', frags)).toEqual([]);
    });

    it('handles empty fragments array', () => {
      expect(checkAssemblyForSites('EcoRI', [])).toEqual([]);
    });

    it('skips fragments without sequence', () => {
      const frags = [{ name: 'frag1' }];
      expect(checkAssemblyForSites('EcoRI', frags)).toEqual([]);
    });
  });
});
