/**
 * primer-derive-binding-tm-zveno.test.js — Звено (фикс, без спеки).
 *
 * The assembly auto-derive emitted flat 20-nt binding regions → low Tm. Turn on
 * Tm-targeting on the new path under the SAME goal as the proven
 * local-primer-design.js findBinding (extend until calcTm ≥ 60), via the config
 * defaults (TEMP_JUNCTION_CFG fallback + seedJunction for seeded junctions).
 * tm-calculator.js is NOT touched — no project-wide Tm re-baseline.
 *
 * Invariants:
 *   • bindingLen with a Tm target extends an AT-rich end past the flat 20 nt.
 *   • binding never drops below BIND_MIN (18, aligned to the proven pipeline).
 *   • deriveAutoPrimers (live default path, no stored junction config → TEMP
 *     fallback) now yields a Tm-targeted binding ≥ ~58 °C, longer than 20.
 *   • seedJunction (what the finalizer writes to zone.junctions) carries the
 *     Tm default so SEEDED junctions also extend (not just unsaved ones).
 */
import { describe, it, expect } from 'vitest';
import { calcTm } from '../../../tm-calculator';
import { bindingLen, deriveAutoPrimers } from '../lib/primer-derive';
import { seedJunction } from '../lib/junction-derive';

// 40-nt AT-rich source: a flat 20-mer melts well under 60 °C, so a Tm loop must
// extend it; a longer window reaches the target.
const AT_RICH = 'CAATGACCTAATGCACATGACCTAATGCACATGACCTAAT';
// GC-rich: a short window already exceeds 60 °C → the loop returns at the floor.
const GC_RICH = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';

describe('Звено — bindingLen Tm targeting (mirrors findBinding ≥60)', () => {
  it('AT-rich end extends past the flat 20 nt when a Tm target is set', () => {
    // sanity: the flat 20-mer is genuinely below target (so it SHOULD extend)
    expect(calcTm(AT_RICH.slice(0, 20))).toBeLessThan(60);
    const len = bindingLen(AT_RICH, 'fwd', null, 60);
    expect(len).toBeGreaterThan(20);
    expect(calcTm(AT_RICH.slice(0, len))).toBeGreaterThan(calcTm(AT_RICH.slice(0, 20)));
  });

  it('binding never drops below BIND_MIN (18)', () => {
    // GC-rich hits the target immediately → returns the floor, not below it.
    expect(bindingLen(GC_RICH, 'fwd', null, 60)).toBeGreaterThanOrEqual(18);
    // tiny AT seq shorter than the floor → clamps to its own length, still ≥ nothing weird
    expect(bindingLen('ATAT', 'fwd', null, 60)).toBe(4);
  });

  it('no-Tm fallback still honours an explicit bindingLength (level 1/2 untouched)', () => {
    expect(bindingLen(AT_RICH, 'fwd', 20, null)).toBe(20);
  });
});

describe('Звено — deriveAutoPrimers default path is Tm-targeted', () => {
  function atState() {
    return {
      containers: [{ id: 'c1', kind: 'molecule', sequence: AT_RICH, annotations: [] }],
      pieces: [
        {
          id: 'p1', kind: 'sourced', sourceIds: ['c1'],
          ranges: [{ sourceId: 'c1', start: 0, end: 40, orientation: 'forward' }],
          zoneId: 'z1', createdAt: 1,
        },
        {
          id: 'p2', kind: 'sourced', sourceIds: ['c1'],
          ranges: [{ sourceId: 'c1', start: 0, end: 40, orientation: 'forward' }],
          zoneId: 'z1', createdAt: 2,
        },
      ],
      zones: [], // no stored zone.junctions → TEMP_JUNCTION_CFG fallback
    };
  }

  it('AT-rich auto primer binding is longer than 20 nt and Tm ≥ 58 °C', () => {
    const primers = deriveAutoPrimers(
      { id: 'g1', kind: 'overlap_pcr', zoneId: 'z1', inputPieces: ['p1', 'p2'] },
      atState(),
    );
    const fwd = primers.find((p) => p.source.pieceId === 'p1' && p.source.side === 'fwd');
    expect(fwd).toBeTruthy();
    expect(fwd.bindingSequence.length).toBeGreaterThan(20);
    expect(fwd.tm).toBeGreaterThanOrEqual(58);
  });
});

describe('Звено — seedJunction carries the Tm default (seeded junctions extend too)', () => {
  it('seed has bindingTm set and bindingLength null (Tm loop, not flat 20)', () => {
    const seed = seedJunction();
    expect(seed.bindingTm).toBeGreaterThanOrEqual(60);
    expect(seed.bindingLength).toBeNull();
  });
});
