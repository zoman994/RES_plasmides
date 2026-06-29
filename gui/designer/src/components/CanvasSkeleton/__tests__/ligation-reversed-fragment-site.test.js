/**
 * V184 (Игорь 29.06) — «после лигирования не обнаруживается сайт ApaI … он на
 * обратной цепи теперь». A restriction fragment placed REVERSED lost its sticky-end
 * RE site at the seam. Root cause: assembly segments are stored as the TOP-strand
 * slice between top cuts (so FORWARD concatenation re-forms each shared overhang
 * exactly once — see segment-overhangs.js stickyEndExtent). A plain
 * reverseComplement(topStrandSlice) on a flip does NOT restore the overhang
 * stagger, so the seam no longer spells the enzyme's recognition site.
 *
 * Biological oracle: ApaI (GGGCC^C, palindromic 3′ GGCC overhang) sites SURVIVE
 * ligation regardless of fragment orientation — the count in the assembled product
 * must equal the count in the source plasmid, forward OR reversed.
 */
import { describe, it, expect } from 'vitest';
import { draftFromZone } from '../lib/zone-pieces-to-dag';
import { computeAssemblySequence } from '../lib/assembly-model';
import { scanAllSites } from '../../../restriction-db';
import { reverseComplementSegment } from '../lib/segment-overhangs';
import { RE_ENZYMES } from '../../../restriction-db';

// Circular plasmid with EXACTLY two ApaI sites (GGGCCC @ 0 and @ 16), non-
// palindromic interior so a flip genuinely changes the sequence.
const SRC = `${'GGGCCC'}${'AATTCCGGTT'}${'GGGCCC'}${'ACGTACGTAC'}`; // 32 nt
const ORIGIN = {
  id: 'src-1', kind: 'molecule', name: 'pSrc', sequence: SRC,
  topology: { circular: true }, annotations: [],
};

// digestFragments(SRC,['ApaI'],true) → top cuts at 5 and 21:
//   p0 = [5,21)            (forward span)
//   p1 = [21,32)+[0,5)     (wraps the origin)
function sourcedPiece(id, ranges, orientation = 'forward') {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src-1'],
    ranges: ranges.map((r) => ({ ...r, sourceId: 'src-1', orientation })),
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: ['ApaI', 'ApaI'], cutSites: [{ position: 5 }, { position: 21 }] },
    origin: 'legacy-migration', functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    frozen: false, createdAt: 1, updatedAt: 1,
  };
}

function zoneState(p1Orientation) {
  return {
    containers: [ORIGIN],
    operations: [], junctions: [], assemblyDrafts: [], positions: {},
    zones: [{ id: 'zn-1', name: 'Сборка', topology: { circular: true, explicit: true }, bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [
      sourcedPiece('p0', [{ start: 5, end: 21 }], 'forward'),
      sourcedPiece('p1', [{ start: 21, end: 32 }, { start: 0, end: 5 }], p1Orientation),
    ],
  };
}

const apaiCount = (seq, circular = true) => {
  const hits = scanAllSites(seq, { circular, minSiteLen: 6 }).find((s) => s.enzyme === 'ApaI');
  return hits ? (hits.positions || []).length : 0;
};

describe('V184 — reversed RE fragment keeps its sticky-end site', () => {
  it('source plasmid has exactly 2 ApaI sites (sanity)', () => {
    expect(apaiCount(SRC)).toBe(2);
  });

  it('FORWARD assembly product reconstitutes both ApaI sites (guard)', () => {
    const draft = draftFromZone(zoneState('forward'), zoneState('forward').zones[0]);
    const { sequence } = computeAssemblySequence(draft);
    expect(apaiCount(sequence)).toBe(2);
  });

  it('REVERSED p1 product STILL reconstitutes both ApaI sites', () => {
    const draft = draftFromZone(zoneState('reverse'), zoneState('reverse').zones[0]);
    const { sequence } = computeAssemblySequence(draft);
    expect(apaiCount(sequence)).toBe(2);
  });
});

describe('reverseComplementSegment — overhang-aware flip (pure)', () => {
  const seg = (sequence, enzymes, deltaDummy) => ({
    sequence,
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes, cutSites: [{ position: 1 }, { position: 2 }] },
    reverseComplement: false,
  });

  it('3′ overhang (ApaI): flipped seam re-forms GGGCCC with a forward neighbour', () => {
    // p1 forward top strand = source[21:32]+[0:5] = "CACGTACGTACGGGCC"
    const flipped = reverseComplementSegment(seg('CACGTACGTACGGGCC', ['ApaI', 'ApaI']), RE_ENZYMES);
    // p0 forward ends "GGGCC"; flipped p1 must start with "C" so the seam = GGGCCC.
    expect(`GGGCC${flipped[0]}`).toBe('GGGCCC');
    // and it must END with GGGCC so the ring-closure wrap re-forms GGGCCC too.
    expect(flipped.slice(-5)).toBe('GGGCC');
  });

  it('blunt ends fall back to plain reverse-complement', () => {
    const flipped = reverseComplementSegment(seg('AAAATTTTCCCC', ['EcoRV', 'EcoRV']), RE_ENZYMES);
    expect(flipped).toBe('GGGGAAAATTTT'); // RC("AAAATTTTCCCC")
  });
});
