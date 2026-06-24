/**
 * re-site-audit — RE-site uniqueness check for the fragment picker.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { auditReSites } from '../lib/re-site-audit';
import { setCustomEnzymeRegistry } from '../../../restriction-db';

afterEach(() => setCustomEnzymeRegistry({}));

// EcoRI = GAATTC, BamHI = GGATCC
const ONE_EACH = 'AAAAGAATTCAAAAAAGGATCCAAAA'; // 1 EcoRI + 1 BamHI
const TWO_ECORI = 'GAATTCTTTTTTTTGAATTCTTTT'; // 2 EcoRI sites
const THREE_ECORI = 'GAATTCTTTTGAATTCTTTTGAATTC'; // 3 EcoRI sites

describe('auditReSites', () => {
  it('two distinct enzymes cutting once each → unique (not ambiguous)', () => {
    const r = auditReSites(ONE_EACH, ['EcoRI', 'BamHI'], false);
    expect(r.total).toBe(2);
    expect(r.ambiguous).toBe(false);
    expect(r.offenders).toEqual([]);
  });

  it('a single enzyme cutting exactly twice is a clean 2-cut fragment', () => {
    const r = auditReSites(TWO_ECORI, ['EcoRI'], false);
    expect(r.perEnzyme[0].count).toBe(2);
    expect(r.ambiguous).toBe(false);
  });

  it('an enzyme cutting three times → ambiguous, flagged as an offender', () => {
    const r = auditReSites(THREE_ECORI, ['EcoRI'], false);
    expect(r.perEnzyme[0].count).toBe(3);
    expect(r.ambiguous).toBe(true);
    expect(r.offenders[0]).toMatchObject({ enzyme: 'EcoRI', count: 3 });
  });

  it('two enzymes where one cuts twice → ambiguous (total > 2)', () => {
    // EcoRI ×2 + BamHI ×1
    const seq = `${TWO_ECORI}GGATCC`;
    const r = auditReSites(seq, ['EcoRI', 'BamHI'], false);
    expect(r.total).toBe(3);
    expect(r.ambiguous).toBe(true);
    expect(r.offenders.map((o) => o.enzyme)).toContain('EcoRI');
  });

  it('empty / missing enzymes → no audit, not ambiguous', () => {
    expect(auditReSites(ONE_EACH, [], false).ambiguous).toBe(false);
    expect(auditReSites('', ['EcoRI'], false).total).toBe(0);
  });

  // Игорь 22.06 (BmgBI + BtrI на плазмиде): «на деле 1 разрез а не два, место
  // реза этих рестриктаз совпадает». total must count DISTINCT cut positions, not
  // (enzyme × site) pairs — coincident cuts are ONE break.
  it('two enzymes whose cut lands on the SAME bond count as ONE break', () => {
    setCustomEnzymeRegistry({
      IsoA: { site: 'GAATTC', cut: [1, 5] },
      IsoB: { site: 'GAATTC', cut: [1, 5] }, // same site + same cut → same cut position
    });
    const r = auditReSites('AAAAGAATTCAAAA', ['IsoA', 'IsoB'], false);
    expect(r.total).toBe(1);
    expect(r.ambiguous).toBe(false);
  });

  it('neoschizomers (same site, DIFFERENT cut offset) are two distinct cuts', () => {
    setCustomEnzymeRegistry({
      IsoA: { site: 'GAATTC', cut: [1, 5] }, // cut at pos+1
      NeoB: { site: 'GAATTC', cut: [3, 3] }, // cut at pos+3
    });
    const r = auditReSites('AAAAGAATTCAAAA', ['IsoA', 'NeoB'], false);
    expect(r.total).toBe(2);
  });
});
