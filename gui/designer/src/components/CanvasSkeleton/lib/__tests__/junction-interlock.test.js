/**
 * V160 — junctionInterlock: given the LEFT segment's RIGHT overhang and the
 * RIGHT segment's LEFT overhang (each {enzyme,delta,type,seq,label}|null),
 * decide whether the two cohesive ends MATE at the seam and describe the
 * interlock geometry (which strand each fragment owns in the overhang zone).
 *
 * Compatibility = the project's canonical RE-ligation rule (restriction-db.js
 * getCompatible): same overhang seq + same polarity → mate; blunt+blunt → mate.
 */
import { describe, it, expect } from 'vitest';
import { junctionInterlock } from '../segment-overhangs.js';

// end-info objects shaped like segmentOverhangs() output
const end = (type, seq, delta, label) => ({ enzyme: 'X', type, seq, delta, label });
const fiveP = (seq, label) => end('5prime', seq, seq.length, label);   // delta > 0
const threeP = (seq, label) => end('3prime', seq, -seq.length, label); // delta < 0
const blunt = () => end('blunt', '', 0, 'тупой');

describe('junctionInterlock — compatibility verdict', () => {
  it('same 5′ overhang (EcoRI/EcoRI) → compatible, length = overhang len', () => {
    const r = junctionInterlock(fiveP('AATT', '5′ AATT'), fiveP('AATT', '5′ AATT'));
    expect(r.verdict).toBe('compatible');
    expect(r.length).toBe(4);
    expect(r.overhang).toBe('AATT');
    expect(r.message).toMatch(/AATT/);
  });

  it('cross-cutter same 5′ overhang (BamHI GATC / BglII GATC) → compatible', () => {
    const r = junctionInterlock(fiveP('GATC', '5′ GATC'), fiveP('GATC', '5′ GATC'));
    expect(r.verdict).toBe('compatible');
    expect(r.overhang).toBe('GATC');
  });

  it('different 5′ overhang (EcoRI AATT / SalI TCGA) → incompatible, names both', () => {
    const r = junctionInterlock(fiveP('AATT', '5′ AATT'), fiveP('TCGA', '5′ TCGA'));
    expect(r.verdict).toBe('incompatible');
    expect(r.message).toMatch(/AATT/);
    expect(r.message).toMatch(/TCGA/);
  });

  it('RC-BIO-4 — degenerate overhang (StyI CWWG / CWWG) → unknown, NOT a false compatible', () => {
    // Two StyI cuts give concrete CAAG vs CTTG that do not anneal; the stored IUPAC
    // string is equal, so naive string-equality would wrongly read «compatible».
    const r = junctionInterlock(fiveP('CWWG', '5′ CWWG'), fiveP('CWWG', '5′ CWWG'));
    expect(r.verdict).toBe('unknown');
    expect(r.message).toMatch(/вырожден/i);
  });

  it('RC-BIO-4 — SfiI NNN overhang → unknown (cannot auto-verify)', () => {
    const r = junctionInterlock(threeP('NNN', '3′ NNN'), threeP('NNN', '3′ NNN'));
    expect(r.verdict).toBe('unknown');
  });

  it('same seq but opposite polarity (5′ GGCC / 3′ GGCC) → incompatible', () => {
    const r = junctionInterlock(fiveP('GGCC', '5′ GGCC'), threeP('GGCC', '3′ GGCC'));
    expect(r.verdict).toBe('incompatible');
  });

  it('blunt + blunt → blunt, length 0', () => {
    const r = junctionInterlock(blunt(), blunt());
    expect(r.verdict).toBe('blunt');
    expect(r.length).toBe(0);
  });

  it('blunt + sticky → incompatible', () => {
    expect(junctionInterlock(blunt(), fiveP('AATT', '5′ AATT')).verdict).toBe('incompatible');
    expect(junctionInterlock(fiveP('AATT', '5′ AATT'), blunt()).verdict).toBe('incompatible');
  });

  it('missing either end → unknown (renders nothing)', () => {
    expect(junctionInterlock(null, fiveP('AATT', '5′ AATT')).verdict).toBe('unknown');
    expect(junctionInterlock(fiveP('AATT', '5′ AATT'), null).verdict).toBe('unknown');
    expect(junctionInterlock(null, null).verdict).toBe('unknown');
  });
});

describe('junctionInterlock — interlock geometry (which strand each fragment owns)', () => {
  it('5′ compatible → overhang zone AFTER the cut; top=next, bottom=this', () => {
    // A right 5′ → A bottom protrudes; B left 5′ → B top protrudes; same 4 cols past p
    const r = junctionInterlock(fiveP('AATT', '5′ AATT'), fiveP('AATT', '5′ AATT'));
    expect(r.side).toBe('afterP');
    expect(r.topOwner).toBe('next'); // B (right fragment) top strand
    expect(r.botOwner).toBe('this'); // A (left fragment) bottom strand
  });

  it('3′ compatible → overhang zone BEFORE the cut; top=this, bottom=next', () => {
    const r = junctionInterlock(threeP('TGCA', '3′ TGCA'), threeP('TGCA', '3′ TGCA'));
    expect(r.side).toBe('beforeP');
    expect(r.topOwner).toBe('this'); // A (left fragment) top strand
    expect(r.botOwner).toBe('next'); // B (right fragment) bottom strand
  });

  it('blunt / incompatible / unknown carry no strand-owner geometry', () => {
    expect(junctionInterlock(blunt(), blunt()).side).toBeNull();
    expect(junctionInterlock(fiveP('AATT', '5′ AATT'), fiveP('TCGA', '5′ TCGA')).side).toBeNull();
    expect(junctionInterlock(null, null).side).toBeNull();
  });
});
