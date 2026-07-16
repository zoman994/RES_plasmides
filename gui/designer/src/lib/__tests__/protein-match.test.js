import { describe, it, expect, beforeEach } from 'vitest';
import { proteinMatch, makeProteinMatch, normalizeAaQuery } from '../protein-match.js';
import { clearDerivedProteinCache } from '../derived-protein.js';
import { entryToDocument } from '../search-document-adapters.js';

// The DerivedProtein cache is module-global; reset it so fixtures that reuse an
// (id, revision) across different sequences stay order-independent.
beforeEach(() => clearDerivedProteinCache());

// Build a minimal SearchDocument (the shape library-search passes to proteinMatch).
function doc(seq, features, { topology = 'linear', id = 'e1', revision = 'r1' } = {}) {
  return {
    ref: { kind: 'entry', id, revision },
    title: id,
    sequence: { seq, topology },
    features,
  };
}
const CDS = (over = {}) => ({ id: 'c', name: 'gene1', type: 'CDS', start: 0, end: over.end ?? 24, strand: 1, ...over });

describe('normalizeAaQuery', () => {
  it('uppercases and drops non-amino-acid characters', () => {
    expect(normalizeAaQuery('  hhh hhh ')).toBe('HHHHHH');
    expect(normalizeAaQuery('m-a.k')).toBe('MAK');
  });
});

describe('proteinMatch — CDS-directed protein search', () => {
  it('finds a His-tag and maps it back to nucleotide coordinates', () => {
    // ATG + CAT×6 + TAA → M H H H H H H *  → mature MHHHHHH
    const d = doc('ATGCATCATCATCATCATCATTAA', [CDS()]);
    const occ = proteinMatch('HHHHHH', d, {});
    expect(occ).toHaveLength(1);
    expect(occ[0].location.segments).toEqual([{ start: 3, end: 21 }]); // the 6 His codons
    expect(occ[0].location.strand).toBe('+');
    expect(occ[0].metrics.identity).toBe(1);
    expect(occ[0].protein).toMatchObject({ intronExcluded: false, exonCount: 1, aaStart: 2, aaEnd: 7 });
  });

  it('THE FLAGSHIP — finds one protein across codon-optimized (synonymous) DNA', () => {
    const catTag = doc('ATGCATCATCATCATCATCATTAA', [CDS()], { id: 'cat' }); // His via CAT
    const cacTag = doc('ATGCACCACCACCACCACCACTAA', [CDS()], { id: 'cac' }); // His via CAC
    expect(proteinMatch('HHHHHH', catTag, {})).toHaveLength(1);
    expect(proteinMatch('HHHHHH', cacTag, {})).toHaveLength(1);
  });

  it('splice-aware — a tag in exon2 excludes the intron and reports 2 exons', () => {
    // exon1(6) ATG GCG | intron(12) | exon2(21) His×6 + stop
    const seq = 'ATGGCG' + 'GTAAGCTAACAG' + 'CATCATCATCATCATCATTAA';
    const features = [
      { id: 'c', name: 'g', type: 'CDS', start: 0, end: seq.length, strand: 1 },
      { id: 'i', type: 'intron', regionId: 'c', start: 6, end: 18 },
    ];
    const occ = proteinMatch('HHHHHH', doc(seq, features), {});
    expect(occ).toHaveLength(1);
    expect(occ[0].location.segments).toEqual([{ start: 18, end: 36 }]); // all in exon2
    expect(occ[0].protein).toMatchObject({ intronExcluded: true, exonCount: 2 });
  });

  it('reverse-strand CDS reports strand −', () => {
    // reverse-complement of ATGCATCATCATCATCATCATTAA
    const seq = 'TTAATGATGATGATGATGATGCAT';
    const occ = proteinMatch('HHHHHH', doc(seq, [CDS({ strand: -1 })]), {});
    expect(occ).toHaveLength(1);
    expect(occ[0].location.strand).toBe('-');
  });

  it('no match → empty', () => {
    expect(proteinMatch('WWWWWW', doc('ATGCATCATCATCATCATCATTAA', [CDS()]), {})).toEqual([]);
  });

  it('X in the query is a wildcard residue; identity reflects literal matches, not 100% (REV #7)', () => {
    // MHHHHHH — query H X H H matches HHHH inside the run
    const occ = proteinMatch('HXHH', doc('ATGCATCATCATCATCATCATTAA', [CDS()]), {});
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0].metrics.uncertainMatches).toBe(1);
    expect(occ[0].metrics.identity).toBeCloseTo(3 / 4); // 3 literal of 4 — NOT «100%»
    expect(occ[0].metrics.compatibility).toBe(1);
  });

  it('makeProteinMatch returns a (aaQuery, doc) closure over ctx', () => {
    const fn = makeProteinMatch({});
    expect(typeof fn).toBe('function');
    expect(fn('HHHHHH', doc('ATGCATCATCATCATCATCATTAA', [CDS()]))).toHaveLength(1);
  });
});

describe('proteinMatch — end-to-end via entryToDocument (regionId preserved)', () => {
  it('splices a real library entry and finds the tag with the intron excluded', () => {
    const seq = 'ATGGCG' + 'GTAAGCTAACAG' + 'CATCATCATCATCATCATTAA';
    const entry = {
      id: 'lib1', name: 'HisFusion',
      payload: {
        sequence: seq,
        topology: 'linear',
        annotations: [
          { id: 'c', name: 'gene', type: 'CDS', start: 0, end: seq.length, strand: 1 },
          { id: 'i', type: 'intron', regionId: 'c', start: 6, end: 18 },
        ],
      },
    };
    const document = entryToDocument(entry);
    expect(document.features.find((f) => f.type === 'intron').regionId).toBe('c'); // adapter preserved the link
    const occ = proteinMatch('HHHHHH', document, {});
    expect(occ).toHaveLength(1);
    expect(occ[0].protein.intronExcluded).toBe(true);
  });
});
