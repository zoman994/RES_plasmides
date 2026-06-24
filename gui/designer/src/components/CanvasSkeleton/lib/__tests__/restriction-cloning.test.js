/**
 * S3 (V163) — restriction-cloning chemistry: surfaces the two empty-vector
 * background mechanisms (NEB canon) + double-digest staging for an RE assembly.
 *   • Different overhangs at the two ends → DIRECTIONAL cloning, the vector
 *     can't recircularise → no dephosphorylation needed.
 *   • Same overhangs → non-directional → self-ligation risk → dephosphorylate
 *     the vector (Quick CIP / rSAP).
 *   • Two enzymes with different buffer/temp → can't co-digest → sequential.
 * Mirrors digest()'s isDirectional/selfLigationRisk + reuses checkDoubleDigest.
 */
import { describe, it, expect } from 'vitest';
import { RE_ENZYMES, generateRETail } from '../../../../restriction-db.js';
import { segmentRestrictionPlan, assemblyRestrictionCloning, suggestEnzymesForNextFragment } from '../restriction-cloning.js';

const reSeg = (enzymes, id = 'x') => ({
  id,
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes, cutSites: [{ position: 2 }, { position: 20 }] },
});

describe('segmentRestrictionPlan', () => {
  it('EcoRI + BamHI → directional, same buffer → one-pot, no dephosphorylation', () => {
    const p = segmentRestrictionPlan(reSeg(['EcoRI', 'BamHI']), RE_ENZYMES);
    expect(p.directional).toBe(true); // AATT ≠ GATC
    expect(p.selfLigationRisk).toBe(false);
    expect(p.recommendDephosphorylation).toBe(false);
    expect(p.doubleDigest.sequential).toBe(false); // both CutSmart/37
  });

  it('EcoRI + BglII → directional but DIFFERENT buffer → sequential digest', () => {
    const p = segmentRestrictionPlan(reSeg(['EcoRI', 'BglII']), RE_ENZYMES);
    expect(p.directional).toBe(true);
    expect(p.doubleDigest.sequential).toBe(true); // CutSmart vs NEBuffer 3.1
  });

  it('EcoRI + MfeI (both 5′ AATT) → same overhang → self-ligation risk → dephosphorylate', () => {
    const p = segmentRestrictionPlan(reSeg(['EcoRI', 'MfeI']), RE_ENZYMES);
    expect(p.directional).toBe(false);
    expect(p.selfLigationRisk).toBe(true);
    expect(p.recommendDephosphorylation).toBe(true);
    expect(p.message).toMatch(/дефосфорил|CIP|rSAP/i);
  });

  it('single enzyme both ends → no double-digest object, self-ligation risk', () => {
    const p = segmentRestrictionPlan(reSeg(['EcoRI', 'EcoRI']), RE_ENZYMES);
    expect(p.doubleDigest).toBeNull();
    expect(p.selfLigationRisk).toBe(true);
  });

  it('non-restriction segment → null', () => {
    expect(segmentRestrictionPlan({ acquisitionMethod: 'undefined' }, RE_ENZYMES)).toBeNull();
    expect(segmentRestrictionPlan(null, RE_ENZYMES)).toBeNull();
  });
});

describe('assemblyRestrictionCloning — roll-up', () => {
  it('counts sequential digests + dephosphorylation recommendations', () => {
    const segs = [reSeg(['EcoRI', 'BglII'], 's1'), reSeg(['EcoRI', 'MfeI'], 's2')];
    const r = assemblyRestrictionCloning(segs, RE_ENZYMES);
    expect(r.sequentialDigestCount).toBe(1);
    expect(r.dephosphorylationCount).toBe(1);
    expect(r.perSegment.s1).toBeTruthy();
    expect(r.perSegment.s2.recommendDephosphorylation).toBe(true);
    expect(r.message).toMatch(/последовательн/i);
    expect(r.message).toMatch(/дефосфорил/i);
  });

  it('a clean directional one-pot assembly → no notes', () => {
    const segs = [reSeg(['EcoRI', 'BamHI'], 's1')];
    const r = assemblyRestrictionCloning(segs, RE_ENZYMES);
    expect(r.sequentialDigestCount).toBe(0);
    expect(r.dephosphorylationCount).toBe(0);
    expect(r.message).toBeNull();
  });

  it('is pure (same inputs deep-equal)', () => {
    const segs = [reSeg(['EcoRI', 'MfeI'], 's1')];
    expect(assemblyRestrictionCloning(segs, RE_ENZYMES)).toEqual(assemblyRestrictionCloning(segs, RE_ENZYMES));
  });
});

describe('suggestEnzymesForNextFragment — RC-A1: продолжить теми же рестриктазами', () => {
  // Known sites: BamHI=GGATCC, EcoRI=GAATTC, BglII=AGATCT (compat BamHI, 5′GATC),
  // MfeI=CAATTG (compat EcoRI, 5′AATT). Filler kept free of the relevant 6-cutters.
  const withBamHI = 'AAAAAAGGATCCAAAAAA';        // one GGATCC, no GAATTC/AGATCT
  const withBglII = 'AAAAAAAGATCTAAAAAA';        // one AGATCT (BglII), no GGATCC/GAATTC
  const noAatt = 'GGGGGTTTTTCCCCCAAAAA';         // no GAATTC, no CAATTG (MfeI)

  it('тот же фермент режет следующий фрагмент → sameUsable (с uniqueness)', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: withBamHI });
    expect(r.hasAnyPrev).toBe(true);
    const same = r.sameUsable.find((s) => s.enzyme === 'BamHI');
    expect(same).toBeTruthy();
    expect(same.cutCount).toBe(1);
    expect(same.isUnique).toBe(true);
    expect(r.absent).toEqual([]);
  });

  it('того же нет, но совместимый по липкому концу режет → compatibleUsable', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: withBglII });
    expect(r.sameUsable.find((s) => s.enzyme === 'BamHI')).toBeFalsy();
    const compat = r.compatibleUsable.find((c) => c.enzyme === 'BglII');
    expect(compat).toBeTruthy();
    expect(compat.compatibleWith).toBe('BamHI');
    expect(r.absent.find((a) => a.enzyme === 'BamHI')).toBeFalsy();
  });

  it('ни того, ни совместимого нет → absent + RE-тейл для праймера', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['EcoRI'], nextSeq: noAatt });
    expect(r.sameUsable.find((s) => s.enzyme === 'EcoRI')).toBeFalsy();
    expect(r.compatibleUsable.find((c) => c.enzyme === 'MfeI')).toBeFalsy();
    const miss = r.absent.find((a) => a.enzyme === 'EcoRI');
    expect(miss).toBeTruthy();
    expect(miss.tail).toBe(generateRETail('EcoRI'));
    expect(miss.tail).toContain('GAATTC');
  });

  it('нет предыдущих ферментов → hasAnyPrev=false, всё пусто', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: [], nextSeq: withBamHI });
    expect(r.hasAnyPrev).toBe(false);
    expect(r.sameUsable).toEqual([]);
    expect(r.compatibleUsable).toEqual([]);
    expect(r.absent).toEqual([]);
  });

  it('guards: пустой/битый ввод', () => {
    expect(suggestEnzymesForNextFragment().hasAnyPrev).toBe(false);
    expect(suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: '' }).sameUsable).toEqual([]);
    expect(suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: null }).absent).toEqual([]);
  });

  it('дедуп: тот же фермент не повторяется, совместимый не дублируется между prev', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI', 'BamHI'], nextSeq: withBamHI });
    expect(r.sameUsable.filter((s) => s.enzyme === 'BamHI').length).toBe(1);
  });

  it('пара ферментов: один режет (same), другой нет (absent)', () => {
    // withBamHI has GGATCC (BamHI) but no GAATTC (EcoRI) and no MfeI site
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI', 'EcoRI'], nextSeq: withBamHI });
    expect(r.sameUsable.find((s) => s.enzyme === 'BamHI')).toBeTruthy();
    expect(r.absent.find((a) => a.enzyme === 'EcoRI')).toBeTruthy();
  });

  it('RC-A1 review — мульти-каттер НЕ зелёный: уходит в sameMultiCut, не в sameUsable', () => {
    // Two GGATCC → BamHI cuts ×2 → cannot define a clean end → needs gel.
    const twoBamHI = `GGATCC${'A'.repeat(12)}GGATCC${'A'.repeat(12)}`;
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: twoBamHI });
    expect(r.sameUsable.find((s) => s.enzyme === 'BamHI')).toBeFalsy();
    const multi = r.sameMultiCut.find((m) => m.enzyme === 'BamHI');
    expect(multi).toBeTruthy();
    expect(multi.cutCount).toBe(2);
    // No compatible/absent fallback when the same enzyme IS present (just not unique).
    expect(r.absent.find((a) => a.enzyme === 'BamHI')).toBeFalsy();
  });

  it('RC-A1 review — совместимый мульти-каттер не предлагается как usable', () => {
    // prev EcoRI absent here; MfeI (compat) present TWICE → not a clean end → absent (primer).
    const twoMfeI = `CAATTG${'A'.repeat(12)}CAATTG${'A'.repeat(12)}`;
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['EcoRI'], nextSeq: twoMfeI });
    expect(r.compatibleUsable.find((c) => c.enzyme === 'MfeI')).toBeFalsy();
    expect(r.absent.find((a) => a.enzyme === 'EcoRI')).toBeTruthy();
  });

  it('RC-A1 review — blunt prev фермент: совместимый тупой уникальный каттер предлагается', () => {
    // EcoRV is blunt (GATATC). SmaI (CCCGGG) is a blunt unique cutter present here.
    const withSmaI = `${'A'.repeat(10)}CCCGGG${'A'.repeat(10)}`;
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['EcoRV'], nextSeq: withSmaI });
    const compat = r.compatibleUsable.find((c) => c.enzyme === 'SmaI');
    expect(compat).toBeTruthy();
    expect(compat.compatibleWith).toBe('EcoRV');
    expect(r.absent.find((a) => a.enzyme === 'EcoRV')).toBeFalsy();
  });

  it('RC-BIO-1 — направленная пара, в next только ОДИН из двух → directionalRisk', () => {
    // prev [BamHI(GATC), EcoRI(AATT)] — directional. withBamHI has BamHI only.
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI', 'EcoRI'], nextSeq: withBamHI });
    expect(r.directionalRisk).toBe(true);
    expect(r.uncovered).toContain('EcoRI');
    expect(r.uncovered).not.toContain('BamHI');
  });

  it('RC-BIO-1 — направленная пара, в next ОБА → directionalRisk=false', () => {
    const both = `GGATCC${'A'.repeat(15)}GAATTC${'A'.repeat(15)}`;
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI', 'EcoRI'], nextSeq: both });
    expect(r.directionalRisk).toBe(false);
    expect(r.uncovered).toEqual([]);
  });

  it('RC-BIO-1 — одиночный фермент → не направленная пара → directionalRisk=false', () => {
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI'], nextSeq: withBamHI });
    expect(r.directionalRisk).toBe(false);
  });

  it('RC-BIO-1 — пара с ОДИНАКОВЫМ overhang (EcoRI+MfeI, оба 5′AATT) НЕ направленная → нет ложного risk', () => {
    // Even if next matches only one, prev itself was non-directional → not a NEW risk.
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['EcoRI', 'MfeI'], nextSeq: withBamHI });
    expect(r.directionalRisk).toBe(false);
  });

  it('RC-A1 review — cross-prev: общий совместимый не дублируется между двумя prev', () => {
    // prev BamHI + BclI (both 5′ GATC). nextSeq has AGATCT (BglII, compatible) ONCE,
    // no GGATCC / TGATCA. BglII must appear once in compatibleUsable.
    const withBglII = `${'A'.repeat(8)}AGATCT${'A'.repeat(8)}`;
    const r = suggestEnzymesForNextFragment({ prevEnzymes: ['BamHI', 'BclI'], nextSeq: withBglII });
    const bgl = r.compatibleUsable.filter((c) => c.enzyme === 'BglII');
    expect(bgl).toHaveLength(1);
    expect(['BamHI', 'BclI']).toContain(bgl[0].compatibleWith);
  });
});
