/**
 * seam-staircase — pure geometry for «настоящая ступенька» (Игорь 26.06 «просто
 * буквы убрать»): which columns on which strand to BLANK so an incompatible
 * restriction overhang reads as physically single-stranded (recessed strand gone),
 * not a coloured box over the letters.
 */
import { describe, it, expect } from 'vitest';
import { computeSeamRecessBlanks, isBlanked } from '../seam-staircase';

const nsiI3 = { enzyme: 'NsiI', type: '3prime', delta: -4, seq: 'TGCA', label: '3′ TGCA' };
const ecoRI5 = { enzyme: 'EcoRI', type: '5prime', delta: 4, seq: 'AATT', label: "5′ AATT" };
const blunt = { type: 'blunt', delta: 0, seq: null, label: 'тупой' };

describe('computeSeamRecessBlanks — internal seams', () => {
  it('left fragment 3′ overhang (NsiI) → blank the BOTTOM strand over its last len cols', () => {
    const zones = [
      { start: 0, end: 16, interlock: { verdict: 'incompatible' }, reOverhangs: { right: nsiI3 } },
      { start: 16, end: 32, reOverhangs: { left: blunt } },
    ];
    expect(computeSeamRecessBlanks(zones, null)).toEqual([
      { pos0: 12, pos1: 16, strand: 'bottom' },
    ]);
  });

  it('left fragment 5′ overhang (EcoRI) → blank the TOP strand over its last len cols', () => {
    const zones = [
      { start: 0, end: 16, interlock: { verdict: 'incompatible' }, reOverhangs: { right: ecoRI5 } },
      { start: 16, end: 32, reOverhangs: { left: blunt } },
    ];
    expect(computeSeamRecessBlanks(zones, null)).toEqual([
      { pos0: 12, pos1: 16, strand: 'top' },
    ]);
  });

  it('right fragment LEFT-end overhang → blank over its FIRST len cols (after p)', () => {
    const zones = [
      { start: 0, end: 16, interlock: { verdict: 'incompatible' }, reOverhangs: { right: blunt } },
      { start: 16, end: 32, reOverhangs: { left: ecoRI5 } }, // 5′ left end → recessed bottom
    ];
    expect(computeSeamRecessBlanks(zones, null)).toEqual([
      { pos0: 16, pos1: 20, strand: 'bottom' },
    ]);
  });

  it('compatible / no interlock → no blanks', () => {
    const zones = [
      { start: 0, end: 16, interlock: { verdict: 'compatible' }, reOverhangs: { right: nsiI3 } },
      { start: 16, end: 32, reOverhangs: { left: nsiI3 } },
    ];
    expect(computeSeamRecessBlanks(zones, null)).toEqual([]);
  });

  it('blunt ends → no blanks (nothing single-stranded)', () => {
    const zones = [
      { start: 0, end: 16, interlock: { verdict: 'incompatible' }, reOverhangs: { right: blunt } },
      { start: 16, end: 32, reOverhangs: { left: blunt } },
    ];
    expect(computeSeamRecessBlanks(zones, null)).toEqual([]);
  });
});

describe('computeSeamRecessBlanks — ring closure', () => {
  it('self-closure: blanks the construct-start LEFT end + the construct-end RIGHT end when sticky', () => {
    const zones = [
      { start: 0, end: 24, reOverhangs: { left: blunt, right: nsiI3 } },
    ];
    const closureSeam = { interlock: { verdict: 'incompatible' }, selfClosure: true };
    // first.left = blunt → no blank; last.right = NsiI 3′ → blank bottom over last cols.
    expect(computeSeamRecessBlanks(zones, closureSeam)).toEqual([
      { pos0: 20, pos1: 24, strand: 'bottom' },
    ]);
  });
});

describe('isBlanked', () => {
  const ranges = [{ pos0: 12, pos1: 16, strand: 'bottom' }];
  it('true inside the range on the matching strand', () => {
    expect(isBlanked(ranges, 13, 'bottom')).toBe(true);
    expect(isBlanked(ranges, 12, 'bottom')).toBe(true);
  });
  it('false on the other strand / outside / empty', () => {
    expect(isBlanked(ranges, 13, 'top')).toBe(false);
    expect(isBlanked(ranges, 16, 'bottom')).toBe(false); // end-exclusive
    expect(isBlanked([], 13, 'bottom')).toBe(false);
  });
});
