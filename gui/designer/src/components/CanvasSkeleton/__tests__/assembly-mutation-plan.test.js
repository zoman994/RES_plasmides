/**
 * assembly-mutation-plan — derive per-segment mutation mechanism over an
 * assembly draft (Кирпич 2 pure helper). Verifies wild-type reconstruction
 * + mechanism selection + ⚓ No-PCR gate through the draft shape that
 * draftFromZone produces (mutant sequence + substitution list on segments).
 */
import { describe, it, expect } from 'vitest';
import { assemblyMutationPlan, wildTypeSequence } from '../lib/assembly-mutation-plan';

const WILD = `ATG${'GCC'.repeat(300)}TAA`; // 906 bp; index 300 = 'G'
const MUTANT = `${WILD.slice(0, 300)}T${WILD.slice(301)}`; // G301T applied
const SUB = { position: 300, fromBase: 'G', toBase: 'T' };

const draftWith = (over = {}, segOver = {}) => ({
  topology: { circular: true },
  segments: [{ id: 's1', sequence: MUTANT, mutations: [SUB], ...segOver }],
  ...over,
});

describe('wildTypeSequence', () => {
  it('reverts a recorded substitution back to the template base', () => {
    expect(wildTypeSequence({ sequence: MUTANT, mutations: [SUB] })).toBe(WILD);
  });

  it('no mutations → sequence unchanged', () => {
    expect(wildTypeSequence({ sequence: WILD, mutations: [] })).toBe(WILD);
  });
});

describe('assemblyMutationPlan', () => {
  it('circular single-segment edit → KLD mechanism + designed primers + protocol', () => {
    const plan = assemblyMutationPlan(draftWith());
    expect(plan.count).toBe(1);
    expect(plan.perSegment[0].segmentId).toBe('s1');
    expect(plan.perSegment[0].mechanism).toBe('kld');
    expect(plan.perSegment[0].label.full).toMatch(/KLD/);
    expect(plan.anyBlocker).toBe(false);
    // 3a — the derived wet-lab output is carried on the plan.
    expect(plan.perSegment[0].primerCount).toBe(2);
    expect(plan.perSegment[0].protocol).toMatch(/KLD/);
  });

  it('linear draft → overlap-extension mechanism + fusion protocol', () => {
    const plan = assemblyMutationPlan(draftWith({ topology: { circular: false } }));
    expect(plan.perSegment[0].mechanism).toBe('two_fragment');
    expect(plan.perSegment[0].protocol.toLowerCase()).toMatch(/overlap|fusion/);
  });

  it('segments without mutations are excluded', () => {
    const plan = assemblyMutationPlan({
      topology: { circular: true },
      segments: [{ id: 's1', sequence: WILD, mutations: [] }],
    });
    expect(plan.count).toBe(0);
  });

  it('⚓ No-PCR fragment mechanism → blocker surfaced', () => {
    const plan = assemblyMutationPlan(
      draftWith({ topology: { circular: false } }, { needsAmplification: false }),
    );
    expect(plan.perSegment[0].mechanism).toBe('two_fragment');
    expect(plan.anyBlocker).toBe(true);
    expect(plan.perSegment[0].blockers[0].kind).toBe('no-pcr-fragment');
  });

  it('empty / missing draft → no throw, count 0', () => {
    expect(assemblyMutationPlan(null).count).toBe(0);
    expect(assemblyMutationPlan({ segments: [] }).count).toBe(0);
  });

  it('forceStrategy overrides the mechanism (circular → forced overlap)', () => {
    const plan = assemblyMutationPlan(draftWith(), { forceStrategy: 'two_fragment' });
    expect(plan.perSegment[0].mechanism).toBe('two_fragment');
  });

  it('canKld reflects circular-standalone (drives the swap affordance)', () => {
    expect(assemblyMutationPlan(draftWith()).perSegment[0].canKld).toBe(true);
    expect(assemblyMutationPlan(draftWith({ topology: { circular: false } })).perSegment[0].canKld).toBe(false);
  });
});
