/**
 * circularize-validate.test.js — M-CIRCULARIZE C4. Pure live biovalidation of a
 * chosen closure method against the actual fragment sequences: Golden Gate
 * internal-site scan (real go/no-go), Gibson/overlap distinguishability + length,
 * KLD single-fragment, blunt self-ligation warning. Surfaced as ✓/⚠/info in the
 * CircularizeModal so the biologist sees feasibility before realising.
 */
import { describe, it, expect } from 'vitest';
import { validateClosure } from '../circularize-validate';

const seg = (sequence, label) => ({ id: label, label, sequence });

describe('validateClosure', () => {
  it('linear → info (no closure reaction)', () => {
    expect(validateClosure({ method: 'gibson', circular: false, segments: [seg('AAAA', 'a')] }).level).toBe('info');
  });

  it('Golden Gate with NO internal BsaI site → ok', () => {
    const r = validateClosure({
      method: 'golden_gate', circular: true,
      segments: [seg('AAAACCCCTTTTGGGGAAAA', 'a'), seg('TTTTAAAACCCCGGGGTTTT', 'b')],
    });
    expect(r.level).toBe('ok');
  });

  it('Golden Gate WITH an internal BsaI site (GGTCTC) → warn + names the enzyme', () => {
    const r = validateClosure({
      method: 'golden_gate', circular: true,
      segments: [seg('AAAGGTCTCAAAATTTT', 'a'), seg('TTTTAAAACCCC', 'b')],
    });
    expect(r.level).toBe('warn');
    expect(r.message).toMatch(/BsaI/);
  });

  it('Gibson with identical last & first fragments → warn (indistinguishable)', () => {
    const dup = 'AAAACCCCGGGGTTTTAAAACCCC';
    const r = validateClosure({ method: 'gibson', circular: true, segments: [seg(dup, 'a'), seg(dup, 'b')] });
    expect(r.level).toBe('warn');
  });

  it('Gibson with distinct, long-enough fragments → ok', () => {
    const r = validateClosure({
      method: 'gibson', circular: true,
      segments: [seg('AAAACCCCGGGGTTTTAAAA', 'a'), seg('TTTTGGGGCCCCAAAATTTT', 'b')],
    });
    expect(r.level).toBe('ok');
  });

  it('Gibson with a too-short fragment (<20 bp) → warn', () => {
    const r = validateClosure({
      method: 'gibson', circular: true,
      segments: [seg('AAAACCCCGGGGTTTTAAAA', 'a'), seg('TTTT', 'b')],
    });
    expect(r.level).toBe('warn');
  });

  it('KLD on a single fragment → ok; on multiple → warn', () => {
    expect(validateClosure({ method: 'kld', circular: true, segments: [seg('AAAACCCC', 'a')] }).level).toBe('ok');
    expect(validateClosure({ method: 'kld', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('warn');
  });

  it('blunt ligation → warn (self-ligation risk)', () => {
    expect(validateClosure({ method: 'direct_ligation', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('warn');
  });

  it('RE-ligation → info', () => {
    expect(validateClosure({ method: 'restriction', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('info');
  });

  // RC-CLOSE-GATE (Игорь 25.06) — a self-closure of an RE fragment must check that
  // its two PHYSICAL ends actually ligate. A blunt end (EcoRV) + a 5′ sticky end
  // (EcoRI) cannot mate → restriction/direct ligation must WARN, not assert «совместимые
  // концы». Self-closure (1 fragment) is the assembly finale, so this is the hot path.
  const reSeg = (enzymes, sequence = 'AAAACCCCGGGGTTTTAAAACCCC', label = 'x') => ({
    id: label, label, sequence,
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes, cutSites: [{ position: 2 }, { position: 20 }] },
  });

  it('RE self-closure with INCOMPATIBLE ends (blunt + sticky) → warn (cannot ligate)', () => {
    const r = validateClosure({ method: 'restriction', circular: true, segments: [reSeg(['EcoRV', 'EcoRI'])] });
    expect(r.level).toBe('warn');
    expect(r.message.toLowerCase()).toMatch(/несовмест|не лигир/);
  });

  it('blunt direct-ligation self-closure with a sticky end present → warn (cannot blunt-ligate a sticky end)', () => {
    const r = validateClosure({ method: 'direct_ligation', circular: true, segments: [reSeg(['EcoRV', 'EcoRI'])] });
    expect(r.level).toBe('warn');
  });

  it('RE self-closure with a single enzyme (two identical AATT ends) → NOT a hard warn (compatible)', () => {
    // One enzyme cut once → both ends carry the same 5′ AATT overhang → они мейтятся.
    const seg1 = {
      id: 'p', label: 'p', sequence: 'AAAACCCCGGGGTTTTAAAACCCC',
      acquisitionMethod: 'restriction', acquisitionParams: { enzymes: ['EcoRI'], cutSites: [{ position: 5 }], single: true },
    };
    expect(validateClosure({ method: 'restriction', circular: true, segments: [seg1] }).level).toBe('info');
  });

  it('KLD self-closure is NOT gated on the original RE ends (PCR rebuilds blunt ends)', () => {
    // KLD амплифицирует всю плазмиду и лигирует ТУПЫЕ концы ПЦР-продукта — исходные
    // RE-overhang'и нерелевантны, поэтому blunt+sticky НЕ должны блокировать KLD.
    expect(validateClosure({ method: 'kld', circular: true, segments: [reSeg(['EcoRV', 'EcoRI'])] }).level).toBe('ok');
  });

  // RC-SEP-KLD (Игорь 25.06 «КЛД и Лигирование идут рука об руку — аккуратно развести»):
  // KLD = whole-plasmid PCR product → kinase + ligase + DpnI; blunt ligation = direct T4
  // on ENDS ALREADY BLUNT (a physical blunt RE cut). Steer the user to the right tool.
  const reSegBlunt = (label = 'p') => ({
    id: label, label, sequence: 'AAAACCCCGGGGTTTTAAAACCCC',
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: ['EcoRV', 'SmaI'], cutSites: [{ position: 2 }, { position: 20 }] },
  });
  const cursorSeg = (label = 'p') => ({
    id: label, label, sequence: 'AAAACCCCGGGGTTTT', acquisitionMethod: 'undefined',
  });

  it('KLD on a physically-blunt RE fragment → info that points to blunt ligation (don\'t over-tool)', () => {
    const r = validateClosure({ method: 'kld', circular: true, segments: [reSegBlunt()] });
    expect(r.level).toBe('info');
    expect(r.message.toLowerCase()).toMatch(/тупо(е|го) лигир/);
  });

  it('KLD on a PCR / cursor single fragment → ok (its real use: kinase + DpnI)', () => {
    const r = validateClosure({ method: 'kld', circular: true, segments: [cursorSeg()] });
    expect(r.level).toBe('ok');
    expect(r.message.toLowerCase()).toMatch(/dpni|киназ/);
  });

  it('blunt ligation on a PCR / cursor single fragment → warn that points to KLD (needs 5′-P + DpnI)', () => {
    const r = validateClosure({ method: 'direct_ligation', circular: true, segments: [cursorSeg()] });
    expect(r.level).toBe('warn');
    expect(r.message.toUpperCase()).toMatch(/KLD/);
  });

  it('blunt ligation on a physically-blunt RE fragment → its correct use (no KLD steer)', () => {
    const r = validateClosure({ method: 'direct_ligation', circular: true, segments: [reSegBlunt()] });
    expect(r.message.toUpperCase()).not.toMatch(/KLD/);
  });
});
