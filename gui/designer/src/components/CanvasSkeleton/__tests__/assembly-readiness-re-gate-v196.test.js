/**
 * V196 — an all-RE assembly with NON-MATING sticky ends must not realise a false product.
 * (e2e-cloning-hunt wbdvc3zyk, HIGH). seedJunction defaults an unset method to 'overlap_pcr'
 * → kind 'overlap', which the readiness gate treats as a homology method (ends re-engineered)
 * and skips the real incompatible interlock → incompatible:0 → the Realise button builds a
 * plasmid whose ends physically cannot ligate.
 *
 * The STICKY_JOIN_KINDS filter is correct for a DELIBERATE homology choice, but a seeded,
 * never-confirmed default ('tentative') is NOT a deliberate choice — so a real overhang
 * mismatch at an UNDECIDED junction must block. A DECIDED overlap/gibson/GG junction (the
 * biologist opted to re-engineer the ends) still ignores the raw RE mismatch.
 */
import { describe, it, expect } from 'vitest';
import { assemblyReadiness, assemblyJunctionConflicts } from '../lib/junction-derive';

const RE_RIGHT = { enzyme: 'EcoRI', seq: 'AATT', type: '5prime', delta: 4, label: "5′ AATT" };
const RE_LEFT = { enzyme: 'BamHI', seq: 'GATC', type: '5prime', delta: 4, label: "5′ GATC" };

// A left zone whose RIGHT boundary interlock is incompatible, joined by `kind`/`state`.
const badSeamZone = (kind, state) => ({
  label: 'insert',
  interlock: { verdict: 'incompatible' },
  junctionRight: { pairKey: 'a|b', kind, state },
  reOverhangs: { right: RE_RIGHT, left: RE_LEFT },
});
const tailZone = { label: 'backbone', interlock: null, junctionRight: null, reOverhangs: { right: RE_LEFT, left: RE_RIGHT } };

describe('V196 — undecided default junction between non-mating RE ends blocks the build', () => {
  it('tentative overlap default + incompatible RE ends → incompatible:1 (was 0 = false product)', () => {
    const zones = [badSeamZone('overlap', 'tentative'), tailZone];
    expect(assemblyReadiness(zones).incompatible).toBe(1);
  });

  it('DECIDED homology method (biologist chose overlap/gibson) → incompatible:0 (ends re-engineered)', () => {
    expect(assemblyReadiness([badSeamZone('overlap', 'decided'), tailZone]).incompatible).toBe(0);
    expect(assemblyReadiness([badSeamZone('gibson', 'decided'), tailZone]).incompatible).toBe(0);
  });

  it('a direct sticky-join kind (re_ligation) still counts regardless of decided state', () => {
    expect(assemblyReadiness([badSeamZone('re_ligation', 'decided'), tailZone]).incompatible).toBe(1);
  });

  it('a COMPATIBLE interlock at an undecided default is NOT blocked (only mismatches block)', () => {
    const zones = [{ ...badSeamZone('overlap', 'tentative'), interlock: { verdict: 'compatible' } }, tailZone];
    expect(assemblyReadiness(zones).incompatible).toBe(0);
  });

  it('conflicts NAMES the undecided mismatching seam (invariant: length === incompatible count)', () => {
    const zones = [badSeamZone('overlap', 'tentative'), tailZone];
    expect(assemblyJunctionConflicts(zones).length).toBe(assemblyReadiness(zones).incompatible);
    expect(assemblyJunctionConflicts(zones).length).toBe(1);
  });
});
