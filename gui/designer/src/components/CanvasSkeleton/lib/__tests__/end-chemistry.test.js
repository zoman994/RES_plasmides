/**
 * S2 (V162) — end-chemistry: the 5′-phosphate state of a fragment's ends (by how
 * it was PHYSICALLY obtained, not how it's joined) + the per-junction END PLAN
 * (what each primer tail must carry + whether the seam needs exogenous
 * phosphorylation). Load-bearing invariant (NEB canon): restriction-cut ends
 * carry a native 5′-phosphate; PCR / cursor / synthesised ends ship 5′-OH, so a
 * blunt/KLD ligation of two 5′-OH ends can't seal without T4 PNK.
 */
import { describe, it, expect } from 'vitest';
import {
  fragmentFivePrimePhosphate, junctionEndPlan, assemblyEndChemistry,
} from '../end-chemistry.js';

const ENZ = { EcoRI: { minFlanking: 1 }, BamHI: { minFlanking: 4 }, BsaI: {} };
const seg = (id, acquisitionMethod) => ({ id, acquisitionMethod });

describe('fragmentFivePrimePhosphate', () => {
  it('restriction-cut fragment carries a native 5′-P', () => {
    expect(fragmentFivePrimePhosphate(seg('a', 'restriction'))).toBe(true);
  });
  it('PCR / cursor / synthesis / missing → 5′-OH (no native phosphate)', () => {
    expect(fragmentFivePrimePhosphate(seg('a', 'pcr'))).toBe(false);
    expect(fragmentFivePrimePhosphate(seg('a', 'ov-pcr'))).toBe(false);
    expect(fragmentFivePrimePhosphate(seg('a', 'undefined'))).toBe(false);
    expect(fragmentFivePrimePhosphate(seg('a', 'synthesis'))).toBe(false);
    expect(fragmentFivePrimePhosphate({})).toBe(false);
    expect(fragmentFivePrimePhosphate(null)).toBe(false);
  });
});

describe('junctionEndPlan — tail per junction method', () => {
  it('overlap_pcr / gibson → both sides need an overlap homology arm, no phosphorylation', () => {
    for (const m of ['overlap_pcr', 'gibson']) {
      const p = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), m, null, ENZ);
      expect(p.left.needsTail).toBe('overlap');
      expect(p.right.needsTail).toBe('overlap');
      expect(p.needsPhosphorylation).toBe(false);
      expect(p.left.protectiveBases).toBe(0);
      expect(p.ready).toBe(true);
    }
  });

  it('restriction → RE site in the tail with per-enzyme protective bases (minFlanking, default 6)', () => {
    const p = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), 'restriction', 'EcoRI', ENZ);
    expect(p.left.needsTail).toBe('re-site');
    expect(p.left.protectiveBases).toBe(1); // EcoRI minFlanking
    expect(p.needsPhosphorylation).toBe(false); // RE cut creates the 5′-P
    const q = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), 'restriction', 'BamHI', ENZ);
    expect(q.left.protectiveBases).toBe(4);
    const r = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), 'restriction', 'BsaI', ENZ);
    expect(r.left.protectiveBases).toBe(6); // no minFlanking → 6 default
  });

  it('golden_gate → Type IIS site in the tail', () => {
    const p = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), 'golden_gate', 'BsaI', ENZ);
    expect(p.left.needsTail).toBe('gg-site');
  });

  it('KLD between two 5′-OH (PCR/cursor) fragments → junction needs phosphorylation', () => {
    const p = junctionEndPlan(seg('a', 'undefined'), seg('b', 'pcr'), 'kld', null, ENZ);
    expect(p.left.needsTail).toBeNull();
    expect(p.needsPhosphorylation).toBe(true);
    expect(p.message).toMatch(/PNK|фосфорилир/i);
  });

  it('blunt ligation with ONE 5′-P (restriction) end → ≥1 phosphate, no PNK needed', () => {
    const p = junctionEndPlan(seg('a', 'restriction'), seg('b', 'pcr'), 'ligation', null, ENZ);
    expect(p.needsPhosphorylation).toBe(false);
    expect(p.left.has5P).toBe(true);
    expect(p.right.has5P).toBe(false);
  });

  it('re_ligation → both ends RE-cut (5′-P), never flagged for PNK (regression guard)', () => {
    const p = junctionEndPlan(seg('a', 'restriction'), seg('b', 'restriction'), 're_ligation', 'EcoRI', ENZ);
    expect(p.needsPhosphorylation).toBe(false);
  });

  it('restriction with NO enzyme chosen → not ready, RU message', () => {
    const p = junctionEndPlan(seg('a', 'undefined'), seg('b', 'undefined'), 'restriction', null, ENZ);
    expect(p.ready).toBe(false);
    expect(p.message).toMatch(/фермент/i);
  });
});

describe('assemblyEndChemistry — roll-up', () => {
  it('a 3-fragment cursor-only KLD chain flags both interior 5′-OH junctions', () => {
    const segs = [seg('s1', 'undefined'), seg('s2', 'undefined'), seg('s3', 'undefined')];
    const r = assemblyEndChemistry(segs, {}, 'kld', ENZ);
    expect(r.needsPhosphorylationCount).toBe(2);
    expect(r.perSegment.s1.right).toBeTruthy();
    expect(r.perSegment.s2.left).toBeTruthy();
    expect(r.perSegment.s2.right).toBeTruthy();
    expect(r.message).toMatch(/фосфорилир/i);
  });

  it('an overlap-PCR chain needs no phosphorylation', () => {
    const segs = [seg('s1', 'undefined'), seg('s2', 'undefined')];
    const r = assemblyEndChemistry(segs, {}, 'overlap_pcr', ENZ);
    expect(r.needsPhosphorylationCount).toBe(0);
    expect(r.message).toBeNull();
  });

  it('is pure — same inputs deep-equal, inputs not mutated', () => {
    const segs = [seg('s1', 'undefined'), seg('s2', 'pcr')];
    const a = assemblyEndChemistry(segs, {}, 'kld', ENZ);
    const b = assemblyEndChemistry(segs, {}, 'kld', ENZ);
    expect(a).toEqual(b);
    expect(segs[0]).toEqual({ id: 's1', acquisitionMethod: 'undefined' });
  });
});

describe('assemblyEndChemistry — ring-closure / self-closure seam (CH-3)', () => {
  it('a blunt/KLD-closed ring counts the closure seam (was undercounted by one)', () => {
    const segs = [seg('a', 'pcr'), seg('b', 'pcr')];
    const zj = { a__b: { method: 'overlap_pcr' } };
    // Without closure (linear) — only the internal overlap seam, no phosphorylation.
    expect(assemblyEndChemistry(segs, zj, 'overlap_pcr', ENZ).needsPhosphorylationCount).toBe(0);
    // With the ring-closure seam (b→a) as a blunt ligation → 1 seam needs T4 PNK.
    const r = assemblyEndChemistry(segs, zj, 'overlap_pcr', ENZ, { method: 'direct_ligation' });
    expect(r.needsPhosphorylationCount).toBe(1);
    expect(r.message).toMatch(/фосфорилир/i);
    // the facing ends of the closure seam are badged
    expect(r.perSegment.b.right.needsPhosphorylation).toBe(true);
    expect(r.perSegment.a.left.needsPhosphorylation).toBe(true);
  });

  it('a single-fragment self-closure (KLD) needs phosphorylation — loop ran 0 times before', () => {
    const segs = [seg('f0', 'pcr')];
    // No closure → the length-1 loop never runs → 0 (the old bug).
    expect(assemblyEndChemistry(segs, {}, 'kld', ENZ).needsPhosphorylationCount).toBe(0);
    // With self-closure → the fragment's own two 5′-OH ends need T4 PNK.
    const r = assemblyEndChemistry(segs, {}, 'kld', ENZ, { method: 'kld' });
    expect(r.needsPhosphorylationCount).toBe(1);
    expect(r.perSegment.f0.left.needsPhosphorylation).toBe(true);
    expect(r.perSegment.f0.right.needsPhosphorylation).toBe(true);
  });

  it('a restriction-cut ring closure carries a native 5′-P → no phosphorylation', () => {
    const segs = [seg('a', 'restriction'), seg('b', 'restriction')];
    const r = assemblyEndChemistry(segs, {}, 'restriction', ENZ, { method: 'direct_ligation' });
    expect(r.needsPhosphorylationCount).toBe(0);
  });

  it('a Gibson-closed ring (ends reworked) needs no closure phosphorylation', () => {
    const segs = [seg('a', 'pcr'), seg('b', 'pcr')];
    const r = assemblyEndChemistry(segs, {}, 'overlap_pcr', ENZ, { method: 'gibson' });
    expect(r.needsPhosphorylationCount).toBe(0);
  });
});
