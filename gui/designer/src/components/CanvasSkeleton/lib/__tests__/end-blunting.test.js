/**
 * end-blunting — GAP-1 (Игорь /loop 28.06): «обработать экзонуклеазой до тупых
 * концов, чтобы гибсон/оверлап делать». Pure biology engine: given a fragment's
 * sticky end + a blunting enzyme, decide HOW it goes blunt (fill-in vs chew-back)
 * and WHETHER that enzyme can do it. The future `blunt` op + DAG node call this.
 *
 * Biology encoded (the capability matrix the test pins):
 *   • T4 DNA pol  — fills 5′ overhangs (5′→3′ pol) AND chews 3′ overhangs (3′→5′ exo) → blunts BOTH.
 *   • Klenow      — fills 5′ overhangs only; NO strong 3′ exo → cannot blunt a 3′ overhang.
 *   • Mung Bean / S1 — single-strand nucleases: chew AWAY any ss overhang (5′ or 3′) → blunt.
 * Fill keeps the molecule's footprint (overhang made double-stranded in place);
 * chew removes the overhang nucleotides (footprint shrinks by the overhang length).
 */
import { describe, it, expect } from 'vitest';
import {
  BLUNTING_ENZYMES,
  bluntEnd,
  bluntingEnzymesFor,
  bluntFragment,
} from '../end-blunting.js';

const ENZ = {
  EcoRI: { site: 'GAATTC', cut: [1, 5], end: '5prime', overhang: 'AATT' }, // 5′
  PstI: { site: 'CTGCAG', cut: [5, 1], end: '3prime', overhang: 'TGCA' }, // 3′
  SmaI: { site: 'CCCGGG', cut: [3, 3], end: 'blunt', overhang: null }, // blunt
};
const reSeg = (enzymes, positions) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes, cutSites: positions.map((p) => ({ position: p })) },
});
const FIVE = { type: '5prime', seq: 'AATT', delta: 4, label: '5′ AATT' };
const THREE = { type: '3prime', seq: 'TGCA', delta: -4, label: '3′ TGCA' };
const BLUNT = { type: 'blunt', seq: '', delta: 0, label: 'тупой' };

describe('end-blunting — enzyme capability dictionary', () => {
  it('registers the four standard blunting enzymes with names + capabilities', () => {
    ['T4pol', 'Klenow', 'MungBean', 'S1'].forEach((k) => {
      expect(BLUNTING_ENZYMES[k], k).toBeTruthy();
      expect(typeof BLUNTING_ENZYMES[k].name).toBe('string');
    });
  });
  it('T4 pol fills 5′ and chews 3′; Klenow fills 5′ but cannot chew 3′', () => {
    expect(BLUNTING_ENZYMES.T4pol.blunts5).toBe('fill');
    expect(BLUNTING_ENZYMES.T4pol.blunts3).toBe('chew');
    expect(BLUNTING_ENZYMES.Klenow.blunts5).toBe('fill');
    expect(BLUNTING_ENZYMES.Klenow.blunts3).toBeFalsy();
  });
  it('Mung Bean / S1 chew BOTH overhang polarities', () => {
    expect(BLUNTING_ENZYMES.MungBean.blunts5).toBe('chew');
    expect(BLUNTING_ENZYMES.MungBean.blunts3).toBe('chew');
    expect(BLUNTING_ENZYMES.S1.blunts5).toBe('chew');
    expect(BLUNTING_ENZYMES.S1.blunts3).toBe('chew');
  });
});

describe('end-blunting — bluntEnd (single end → blunt decision)', () => {
  it('5′ overhang + T4 pol → fill-in, blunt, footprint kept (overhangLen reported)', () => {
    const r = bluntEnd(FIVE, 'T4pol');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('fill');
    expect(r.result.type).toBe('blunt');
    expect(r.overhangLen).toBe(4);
  });
  it('5′ overhang + Klenow → fill-in (blunt)', () => {
    const r = bluntEnd(FIVE, 'Klenow');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('fill');
    expect(r.result.type).toBe('blunt');
  });
  it('5′ overhang + Mung Bean → chew-back (blunt)', () => {
    const r = bluntEnd(FIVE, 'MungBean');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('chew');
    expect(r.result.type).toBe('blunt');
  });
  it('3′ overhang + T4 pol → chew-back (blunt)', () => {
    const r = bluntEnd(THREE, 'T4pol');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('chew');
    expect(r.result.type).toBe('blunt');
  });
  it('3′ overhang + Klenow → BLOCKED (no 3′ exo) with a helpful reason', () => {
    const r = bluntEnd(THREE, 'Klenow');
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('blocked');
    expect(r.result).toBeNull();
    expect(r.reason).toMatch(/Klenow|3′|T4|Mung/i);
  });
  it('3′ overhang + Mung Bean → chew-back (blunt)', () => {
    expect(bluntEnd(THREE, 'MungBean').mode).toBe('chew');
  });
  it('already-blunt end → no-op (ok, mode none, overhangLen 0)', () => {
    const r = bluntEnd(BLUNT, 'T4pol');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('none');
    expect(r.overhangLen).toBe(0);
    expect(r.result.type).toBe('blunt');
  });
  it('null end (no overhang info) → no-op ok', () => {
    const r = bluntEnd(null, 'T4pol');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('none');
  });
  it('unknown enzyme → blocked', () => {
    const r = bluntEnd(FIVE, 'NotAnEnzyme');
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('blocked');
  });
});

describe('end-blunting — bluntingEnzymesFor (UX suggestion list)', () => {
  it('5′ overhang → all four enzymes can blunt it', () => {
    expect(bluntingEnzymesFor(FIVE).sort()).toEqual(['Klenow', 'MungBean', 'S1', 'T4pol']);
  });
  it('3′ overhang → Klenow excluded (cannot chew a 3′ overhang)', () => {
    const list = bluntingEnzymesFor(THREE);
    expect(list).not.toContain('Klenow');
    expect(list.sort()).toEqual(['MungBean', 'S1', 'T4pol']);
  });
  it('blunt / null end → empty (nothing to blunt)', () => {
    expect(bluntingEnzymesFor(BLUNT)).toEqual([]);
    expect(bluntingEnzymesFor(null)).toEqual([]);
  });
});

describe('end-blunting — bluntFragment (whole fragment, both ends)', () => {
  it('5′ left + 3′ right + T4 pol → both blunt; chew removes the 3′ overhang only', () => {
    const seg = reSeg(['EcoRI', 'PstI'], [5, 31]); // left EcoRI 5′, right PstI 3′
    const r = bluntFragment(seg, 'T4pol', ENZ);
    expect(r.ok).toBe(true);
    expect(r.left.mode).toBe('fill'); // 5′ filled in place
    expect(r.right.mode).toBe('chew'); // 3′ chewed back
    expect(r.overhangsRemoved).toBe(4); // only the chewed 3′ overhang shrinks footprint
    expect(r.warnings).toHaveLength(0);
  });
  it('5′ left + 3′ right + Klenow → partial: 3′ end blocked → not ok + warning', () => {
    const seg = reSeg(['EcoRI', 'PstI'], [5, 31]);
    const r = bluntFragment(seg, 'Klenow', ENZ);
    expect(r.ok).toBe(false);
    expect(r.left.mode).toBe('fill');
    expect(r.right.mode).toBe('blocked');
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('5′ left + 3′ right + Mung Bean → both chewed → both overhangs removed', () => {
    const seg = reSeg(['EcoRI', 'PstI'], [5, 31]);
    const r = bluntFragment(seg, 'MungBean', ENZ);
    expect(r.ok).toBe(true);
    expect(r.left.mode).toBe('chew');
    expect(r.right.mode).toBe('chew');
    expect(r.overhangsRemoved).toBe(8); // both 4-nt overhangs removed
  });
  it('non-restriction fragment (no overhangs) → ok no-op, nothing removed', () => {
    const r = bluntFragment({ acquisitionMethod: 'pcr' }, 'T4pol', ENZ);
    expect(r.ok).toBe(true);
    expect(r.overhangsRemoved).toBe(0);
  });
  it('unknown enzyme → not ok', () => {
    const seg = reSeg(['EcoRI', 'PstI'], [5, 31]);
    expect(bluntFragment(seg, 'Nope', ENZ).ok).toBe(false);
  });
});
