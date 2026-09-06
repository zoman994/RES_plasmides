/**
 * auto-annotate-reverse-proof.test.js — ANN-INTEGRITY seam BG (observable
 * point 8). A reverse-strand CDS is analysed on the reverse complement; its
 * detail/point hits get the reverse ABSOLUTE mapping, strand −1 and the correct
 * regionId.
 *
 * Negative control: on the pre-fix implementation the reverse region is scanned
 * on the FORWARD substring, so the start codon (revcomp of the trailing stop)
 * is not ATG, the His-tag translates to poly-Met instead of poly-His, and no
 * hit carries strand −1 — the assertions below fail. That is the RED.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { autoAnnotate } from '../auto-annotate';
import { reverseComplement } from '../sequence-utils';
import { resetRegionCounter } from '../domain-detection';
import { makeLocation, LOCATION_KINDS } from '../lib/annotation-location';

beforeEach(() => resetRegionCounter());

const SIGNAL = 'ATGAAATTTGCGATTGTGCTGCTGGCGACC';   // ATG start ... (30 bp)
const CORE   = 'GAAGATCTGCGTAAGCCGGCG'.repeat(5);   // 105 bp
const HISTAG = 'CATCATCATCATCATCAT';                // H×6 (18 bp)
const STOP   = 'TAA';
const FWD_CDS = SIGNAL + CORE + HISTAG + STOP;       // a clean forward CDS
const REV_STORED = reverseComplement(FWD_CDS);       // the same gene, stored on the − strand
const L = REV_STORED.length;

describe('autoAnnotate — reverse-strand CDS', () => {
  const region = {
    id: 'rev1', name: 'revGene', type: 'CDS',
    start: 0, end: L, strand: -1, level: 'region',
  };

  it('start codon maps to the HIGH-coordinate end with strand −1', () => {
    const anns = autoAnnotate({ name: 'revGene', type: 'CDS', sequence: REV_STORED, annotations: [region] });
    const start = anns.find((a) => a.type === 'start_codon');
    expect(start).toBeDefined();
    expect(start.strand).toBe(-1);
    // The reverse gene's start codon sits at the 3′ end in forward coordinates.
    expect(start.start).toBe(L - 3);
    expect(start.end).toBe(L);
    expect(start.regionId).toBe('rev1');
  });

  it('stop codon maps to the LOW-coordinate end with strand −1', () => {
    const anns = autoAnnotate({ name: 'revGene', type: 'CDS', sequence: REV_STORED, annotations: [region] });
    const stop = anns.find((a) => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.strand).toBe(-1);
    expect(stop.start).toBe(0);
    expect(stop.end).toBe(3);
  });

  it('His-tag is found on the reverse frame, strand −1, linked to the region and within bounds', () => {
    const anns = autoAnnotate({ name: 'revGene', type: 'CDS', sequence: REV_STORED, annotations: [region] });
    const his = anns.find((a) => a.level === 'detail' && a.type === 'tag' && /His/.test(a.name || ''));
    expect(his).toBeDefined();
    expect(his.strand).toBe(-1);
    expect(his.regionId).toBe('rev1');
    expect(his.start).toBeGreaterThanOrEqual(0);
    expect(his.end).toBeLessThanOrEqual(L);
    expect(his.start).toBeLessThan(his.end);
  });

  it('every CDS detail on a reverse region carries strand −1', () => {
    const anns = autoAnnotate({ name: 'revGene', type: 'CDS', sequence: REV_STORED, annotations: [region] });
    const details = anns.filter((a) => a.level === 'detail' && a.regionId === 'rev1');
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) expect(d.strand).toBe(-1);
  });

  it('CONTRAST: the same gene stored on the forward strand puts the start codon at the LOW end', () => {
    const anns = autoAnnotate({ name: 'fwdGene', type: 'CDS', sequence: FWD_CDS });
    const start = anns.find((a) => a.type === 'start_codon');
    expect(start.start).toBe(0);
    expect(start.end).toBe(3);
    expect(start.strand).toBe(1);
  });
});

// ── ANN-INTEGRITY correction (accepted blocker) — the reverse proof previously
//    only covered a CONTIGUOUS CDS. A reverse CDS whose canonical location is
//    compound (a spliced join) or crosses the origin has start > end in its
//    scalar projection, so a `seq.slice(start, end)` extraction was EMPTY and no
//    detail was produced. The region sequence must be assembled from the
//    canonical segments in traversal order. ─────────────────────────────────
describe('autoAnnotate — reverse CDS through canonical segments', () => {
  // A short forward CDS whose reverse complement is what the plasmid stores.
  const smallFwd = 'ATG' + 'AAACCCGGG'.repeat(2) + 'TAA'; // 24 nt: ATG…TAA
  const smallStored = reverseComplement(smallFwd);        // 24 nt on the − strand

  it('origin-crossing reverse CDS: segments assembled across the origin, mapped back with strand −1', () => {
    // Circular plasmid of 40 nt. The reverse gene wraps the origin: its forward
    // traversal-order segments are [31,40) then [0,15). Lay the stored bases out
    // so plasmid[31:40)=stored[0:9) and plasmid[0:15)=stored[9:24).
    const plasmid = smallStored.slice(9, 24) + 'T'.repeat(16) + smallStored.slice(0, 9); // 15+16+9 = 40
    const region = {
      id: 'wrapRev', name: 'wrapRev', type: 'CDS', level: 'region', strand: -1,
      location: makeLocation(LOCATION_KINDS.JOIN, [{ start: 31, end: 40 }, { start: 0, end: 15 }]),
      start: 31, end: 15,
    };
    const anns = autoAnnotate({ name: 'wrapRev', type: 'CDS', sequence: plasmid, annotations: [region] });

    const start = anns.find((a) => a.type === 'start_codon');
    expect(start).toBeDefined();               // was undefined (empty slice) pre-fix
    expect(start.strand).toBe(-1);
    expect(start.start).toBe(12);
    expect(start.end).toBe(15);
    expect(start.regionId).toBe('wrapRev');

    const stop = anns.find((a) => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.strand).toBe(-1);
    expect(stop.start).toBe(31);
    expect(stop.end).toBe(34);
  });

  it('linear spliced reverse CDS: exon segments assembled (intron NOT frame-preserving), mapped with strand −1', () => {
    const fwd2 = 'ATG' + 'AAACCC' + 'TAA'; // 12 nt
    const stored2 = reverseComplement(fwd2);
    // exon1 at [5,11) = stored2[0:6), intron of 7 nt (NOT a multiple of 3, so a
    // contiguous span-read loses the reading frame and misses the stop codon),
    // exon2 at [18,24) = stored2[6:12).
    const plasmid = 'T'.repeat(5) + stored2.slice(0, 6) + 'T'.repeat(7) + stored2.slice(6, 12) + 'T'.repeat(4); // 28
    const region = {
      id: 'splRev', name: 'splRev', type: 'CDS', level: 'region', strand: -1,
      location: makeLocation(LOCATION_KINDS.JOIN, [{ start: 5, end: 11 }, { start: 18, end: 24 }]),
      start: 5, end: 24,
    };
    const anns = autoAnnotate({ name: 'splRev', type: 'CDS', sequence: plasmid, annotations: [region] });

    const start = anns.find((a) => a.type === 'start_codon');
    expect(start).toBeDefined();
    expect(start.strand).toBe(-1);
    expect(start.start).toBe(21);
    expect(start.end).toBe(24);

    // The stop codon only resolves when the exons are concatenated across the
    // 7-nt intron — a contiguous span-read cannot find it in-frame.
    const stop = anns.find((a) => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.strand).toBe(-1);
    expect(stop.start).toBe(5);
    expect(stop.end).toBe(8);
  });
});
