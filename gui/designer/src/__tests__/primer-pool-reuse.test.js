/**
 * PRIMER-6 (V180) — primerPoolReuse: auto-detect that an auto-derived primer
 * already exists in the unified pool (so the assembly panel flags «в наличии»
 * without a manual picker). Matches on binding (+ compatible tail), pool-sourced.
 */
import { describe, it, expect } from 'vitest';
import { primerPoolReuse } from '../primer-reuse';

const BIND = 'ACGTACGTACGTACGTACGT'; // 20 nt
const derived = { name: 'auto_fwd', direction: 'forward', bindingSequence: BIND, tail: '', tm: 60 };

describe('primerPoolReuse (V180)', () => {
  it('finds a pool primer with the same binding (forward, no tail)', () => {
    const pool = [
      { id: 'x1', name: 'myStock', direction: 'forward', bindingSequence: BIND, tail: '', tm: 61 },
    ];
    const m = primerPoolReuse(derived, pool);
    expect(m.length).toBe(1);
    expect(m[0].existing.name).toBe('myStock');
  });

  it('no match when binding differs', () => {
    const pool = [{ id: 'x1', name: 'other', direction: 'forward', bindingSequence: 'TTTTTTTTTTTTTTTTTTTT', tm: 60 }];
    expect(primerPoolReuse(derived, pool)).toEqual([]);
  });

  it('empty / missing pool → no matches (no crash)', () => {
    expect(primerPoolReuse(derived, [])).toEqual([]);
    expect(primerPoolReuse(derived, null)).toEqual([]);
    expect(primerPoolReuse(null, [{ id: 'x' }])).toEqual([]);
  });

  it('respects direction (a reverse pool primer is not a forward reuse)', () => {
    const pool = [{ id: 'x1', name: 'rev', direction: 'reverse', bindingSequence: BIND, tm: 60 }];
    expect(primerPoolReuse(derived, pool)).toEqual([]);
  });

  it('adapts tm→tmBinding so Tm gate does not falsely reject pool rows', () => {
    // pool row carries `tm` (pool shape), query carries `tm` — both adapted to
    // tmBinding internally; identical binding → match despite no tmBinding field.
    const pool = [{ id: 'x1', name: 'stock', direction: 'forward', bindingSequence: BIND, tm: 60 }];
    expect(primerPoolReuse(derived, pool).length).toBe(1);
  });
});
