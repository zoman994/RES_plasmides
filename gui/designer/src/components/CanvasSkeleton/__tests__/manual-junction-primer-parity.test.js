/**
 * manual-junction-primer-parity.test.js — TD-PRIMER-MANUAL-A1-PARITY.
 *
 * A manually-written junction primer on a GG/RE junction must carry the SAME
 * method-specific tail as the auto path (the bio-verified `buildOverlapTail`),
 * NOT a plain sequence-overlap tail (which won't ligate for GG/RE). The
 * resolution is pure (`resolveManualJunctionTail`) and applied via
 * `buildAssemblyPrimer({ tailOverride })`. overlap_pcr / gibson keep the
 * neighbour-overlap model (a different, already-correct primer model) untouched.
 */
import { describe, it, expect } from 'vitest';
import { buildAssemblyPrimer } from '../lib/assembly-primer-utils';
import { resolveManualJunctionTail, buildOverlapTail } from '../lib/primer-derive';
import { pairKeyFor } from '../lib/junction-derive';

const boundaries = [
  { segmentId: 'L', startOnAssembly: 0, endOnAssembly: 20, color: '#fff' },
  { segmentId: 'R', startOnAssembly: 20, endOnAssembly: 40, color: '#fff' },
];
const SEQ = 'AAAACCCCGGGGTTTTACGTTGCATTTTGGGGCCCCAAAA'; // 40 nt, boundary at 20

describe('resolveManualJunctionTail — method-specific override (parity with auto)', () => {
  it('golden_gate junction → GG recognition tail; default overhang when piece has none', () => {
    const zj = { [pairKeyFor('L', 'R')]: { method: 'golden_gate' } };
    const tail = resolveManualJunctionTail({
      side: 'fwd', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces: [],
    });
    expect(tail).toBe(buildOverlapTail('fwd', '', { method: 'golden_gate', overhang: 'AAAA' }));
    expect(tail.startsWith('GGTCTC')).toBe(true); // GG recognition, not an overlap
  });

  it('uses piece.ggOverhang (fwd → left piece, mirroring the auto path)', () => {
    const zj = { [pairKeyFor('L', 'R')]: { method: 'golden_gate' } };
    const pieces = [{ id: 'L', ggOverhang: 'AATG' }, { id: 'R', ggOverhang: 'TTTT' }];
    const tail = resolveManualJunctionTail({
      side: 'fwd', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces,
    });
    expect(tail).toBe(buildOverlapTail('fwd', '', { method: 'golden_gate', overhang: 'AATG' }));
  });

  it('rev side ALSO uses the LEFT piece overhang (a junction has ONE overhang, on L)', () => {
    // The junction's overhang lives on the LEFT piece; the auto path encodes it
    // on BOTH the fwd and rev primers. Sourcing R's overhang on the rev side
    // yields a non-complementary sticky end → won't ligate (review 12.06).
    const zj = { [pairKeyFor('L', 'R')]: { method: 'golden_gate' } };
    const pieces = [{ id: 'L', ggOverhang: 'AATG' }, { id: 'R', ggOverhang: 'GCTT' }];
    const tail = resolveManualJunctionTail({
      side: 'rev', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces,
    });
    expect(tail).toBe(buildOverlapTail('rev', '', { method: 'golden_gate', overhang: 'AATG' }));
    expect(tail).not.toBe(buildOverlapTail('rev', '', { method: 'golden_gate', overhang: 'GCTT' }));
  });

  it('rev side restriction ALSO uses the LEFT piece reSite', () => {
    const zj = { [pairKeyFor('L', 'R')]: { method: 'restriction' } };
    const pieces = [{ id: 'L', reSite: 'GAATTC' }, { id: 'R', reSite: 'GGATCC' }];
    const tail = resolveManualJunctionTail({
      side: 'rev', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces,
    });
    expect(tail).toBe(buildOverlapTail('rev', '', { method: 'restriction', reSite: 'GAATTC' }));
  });

  it('restriction junction → protective + site tail from piece.reSite', () => {
    const zj = { [pairKeyFor('L', 'R')]: { method: 'restriction' } };
    const pieces = [{ id: 'L', reSite: 'GAATTC' }];
    const tail = resolveManualJunctionTail({
      side: 'fwd', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces,
    });
    expect(tail).toBe(buildOverlapTail('fwd', '', { method: 'restriction', reSite: 'GAATTC' }));
  });

  it('overlap_pcr / gibson / missing junction → null (keep neighbour-overlap model)', () => {
    const zj = { [pairKeyFor('L', 'R')]: { method: 'overlap_pcr' } };
    expect(resolveManualJunctionTail({
      side: 'fwd', leftSegId: 'L', rightSegId: 'R', zoneJunctions: zj, pieces: [],
    })).toBeNull();
    expect(resolveManualJunctionTail({
      side: 'fwd', leftSegId: 'L', rightSegId: 'R', zoneJunctions: {}, pieces: [],
    })).toBeNull();
  });
});

describe('buildAssemblyPrimer — tailOverride applies the method tail', () => {
  it('override replaces the computed overlap tail (sequence = override + binding)', () => {
    const p = buildAssemblyPrimer({
      assemblySequence: SEQ,
      boundaries,
      range: { start: 0, end: 40 },
      direction: 'forward',
      tailOverride: 'GGTCTCAAATG',
    });
    expect(p.tail).toBe('GGTCTCAAATG');
    expect(p.sequence).toBe(`GGTCTCAAATG${p.bindingSequence}`);
  });

  it('no override → existing neighbour-overlap behaviour (back-compat)', () => {
    const p = buildAssemblyPrimer({
      assemblySequence: SEQ, boundaries, range: { start: 0, end: 40 }, direction: 'forward',
    });
    expect(p.bindingSequence).toBe(SEQ.slice(0, 20)); // left part
    expect(p.tail).toBe(SEQ.slice(20, 40)); // R's first 20 bp (unchanged)
  });
});
