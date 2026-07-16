/**
 * segmentOverhangs — origin-wrap end assignment (Игорь 07.07: «при инверсии
 * теряются липкие концы, если были выбраны две рестриктазы и нажата инвертировать»).
 *
 * The inverted BACKBONE of a two-enzyme excision wraps the circular origin
 * (ranges [hi..len]+[0..lo]) and is stored forward (reverseComplement:false).
 * Its PHYSICAL left end sits at the HIGHER cut (the fragment's 5′ start), right
 * at the lower cut. segmentOverhangs used to sort cutSites by position and assign
 * left=low/right=high unconditionally (only the reverseComplement flag swapped),
 * so a forward origin-wrapping fragment got its two sticky ends SWAPPED — the
 * directional (EcoRI|BamHI) backbone reported the wrong enzyme on each end.
 *
 * Correct model: physical-left-cut = HIGH when exactly one of
 * {reverseComplement, originWrap} holds (XOR); LOW otherwise.
 */
import { describe, it, expect } from 'vitest';
import { segmentOverhangs } from '../segment-overhangs';
import { RE_ENZYMES } from '../../../../restriction-db';

// EcoRI at the lower cut position, BamHI at the higher — a directional pair.
const seg = (over = {}) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes: ['EcoRI', 'BamHI'], cutSites: [{ position: 5 }, { position: 20 }] },
  sequence: 'AATTCXXXXXXXXXXXXXXG', // content irrelevant for end derivation
  ...over,
});

describe('segmentOverhangs — origin-wrap swaps the two ends', () => {
  it('forward, no wrap → left = low cut (EcoRI), right = high cut (BamHI)', () => {
    const oh = segmentOverhangs(seg(), RE_ENZYMES);
    expect(oh.left.enzyme).toBe('EcoRI');
    expect(oh.right.enzyme).toBe('BamHI');
  });

  it('forward + originWrap → left = HIGH cut (BamHI), right = low cut (EcoRI)', () => {
    const oh = segmentOverhangs(seg({ originWrap: true }), RE_ENZYMES);
    expect(oh.left.enzyme).toBe('BamHI'); // was wrongly EcoRI (swapped/lost)
    expect(oh.right.enzyme).toBe('EcoRI');
  });

  it('reverseComplement, no wrap → left = HIGH cut (existing rc swap)', () => {
    const oh = segmentOverhangs(seg({ reverseComplement: true }), RE_ENZYMES);
    expect(oh.left.enzyme).toBe('BamHI');
    expect(oh.right.enzyme).toBe('EcoRI');
  });

  it('reverseComplement + originWrap → double swap = back to normal (EcoRI left)', () => {
    const oh = segmentOverhangs(seg({ reverseComplement: true, originWrap: true }), RE_ENZYMES);
    expect(oh.left.enzyme).toBe('EcoRI');
    expect(oh.right.enzyme).toBe('BamHI');
  });
});
