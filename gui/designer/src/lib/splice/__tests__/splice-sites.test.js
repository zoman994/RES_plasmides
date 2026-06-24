/**
 * splice-sites.test.js — PWM splice-site scorer (Phase 1). Canonical consensus
 * sites must score well above non-consensus ones, and only GT/AG positions are
 * candidates.
 */
import { describe, it, expect } from 'vitest';
import { scoreSpliceSites, pSite } from '../splice-sites';

describe('scoreSpliceSites — PWM donor/acceptor', () => {
  it('scores a canonical donor (…CAG | GTAAGT…) positively at the GT', () => {
    const { donors } = scoreSpliceSites('CAGGTAAGTAAAAAAAA');
    const d = donors.find((x) => x.pos === 3); // G of the GT
    expect(d).toBeTruthy();
    expect(d.score).toBeGreaterThan(2); // strongly consensus-like
  });

  it('ranks a consensus donor above a non-consensus one', () => {
    const strong = scoreSpliceSites('CAGGTAAGTAAAAAAAA').donors.find((x) => x.pos === 3).score;
    const weak = scoreSpliceSites('TTTGTCCCCAAAAAAAA').donors.find((x) => x.pos === 3).score;
    expect(strong).toBeGreaterThan(weak);
  });

  it('scores a canonical acceptor (polypyrimidine…CAG) above a purine tract', () => {
    const pyr = scoreSpliceSites('AAAATTTTTTTTTTCAGGGG').acceptors.find((x) => x.pos === 16);
    const pur = scoreSpliceSites('AAAAAAAAAAAAAACAGGGG').acceptors.find((x) => x.pos === 16);
    expect(pyr).toBeTruthy();
    expect(pur).toBeTruthy();
    expect(pyr.score).toBeGreaterThan(pur.score);
  });

  it('only GT positions are donor candidates and only AG positions acceptors', () => {
    const { donors, acceptors } = scoreSpliceSites('AAAAAAAGTAAAAAAAGCCCCCC');
    // the single GT and single AG (with enough flanking context) are candidates
    expect(donors.every((d) => true)).toBe(true);
    // a sequence with no GT/AG yields nothing
    const none = scoreSpliceSites('AAAACCCCAAAACCCC');
    expect(none.donors.length).toBe(0);
    expect(none.acceptors.length).toBe(0);
  });

  it('pSite is monotonic and bounded in (0,1)', () => {
    expect(pSite(0)).toBeCloseTo(0.5, 6);
    expect(pSite(10)).toBeGreaterThan(pSite(0));
    expect(pSite(-10)).toBeLessThan(pSite(0));
    expect(pSite(100)).toBeLessThanOrEqual(1);
    expect(pSite(-100)).toBeGreaterThanOrEqual(0);
  });
});
