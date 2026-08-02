/**
 * U1 P1 — a resource budget may never be silently disabled.
 *
 * DEFECT (found reviewing U1): `resolveBudgets` closed every axis with
 * `Math.max(0, Math.floor(v))`. `Math.floor` maps NaN, Infinity, a string, an object and an
 * array to NaN or Infinity, and every gate is written `used > budget` — a comparison that is
 * ALWAYS false against NaN and against Infinity. So a caller who passes a malformed budget does
 * not get a smaller limit or an error: that axis becomes UNBOUNDED, quietly. A resource guard
 * that turns itself off when misconfigured is worse than no guard, because the telemetry still
 * reports a budget.
 *
 * CONTRACT under test — an axis value may be exactly one of:
 *   • `undefined`                      -> that axis's own default;
 *   • `null`                           -> that axis explicitly unbounded, and ONLY that axis;
 *   • a finite non-negative INTEGER    -> that quota.
 * Anything else is rejected FAIL-CLOSED, before any search work begins. Same rule for the legacy
 * combined `stateBudget`. The error name is deliberately not asserted — what matters is that the
 * call refuses rather than proceeding unlimited.
 *
 * These cases are unit-level on purpose: no megabyte corpus, so the file stays fast enough to
 * sit in the focused U1 cluster.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-budget-validation.test.js
 */
import { describe, it, expect } from 'vitest';
import { resolveBudgets, DEFAULT_BUDGETS, BUDGET_AXES } from '../dna-search-budget';
import { dnaGappedSearchSession } from '../dna-gapped-search';

// A target small enough that a real search finishes instantly — so if a malformed budget were
// accepted, the call would COMPLETE rather than throw, and the test would fail loudly.
const QUERY = 'ACGTACGTACGTACGTACGT';
const TARGET = `TTTT${QUERY}TTTT`;

const REJECTED = [
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['a numeric string', '1000'],
  ['a non-numeric string', 'lots'],
  ['an object', {}],
  ['an array', [10]],
  ['a boolean', true],
  ['a negative integer', -1],
  ['a non-integer', 1.5],
];

describe('U1 P1 — malformed budgets are rejected, never silently unlimited', () => {
  it.each(REJECTED)('resolveBudgets rejects %s on an axis', (_label, value) => {
    expect(() => resolveBudgets({ scan: value })).toThrow();
  });

  it.each(REJECTED)('rejects %s on every axis, not just scan', (_label, value) => {
    for (const axis of BUDGET_AXES) {
      expect(() => resolveBudgets({ [axis]: value }), axis).toThrow();
    }
  });

  it('accepts the three legal shapes', () => {
    const d = resolveBudgets(undefined);
    for (const axis of BUDGET_AXES) expect(d[axis], axis).toBe(DEFAULT_BUDGETS[axis]);

    expect(resolveBudgets({ scan: null }).scan).toBeNull();
    expect(resolveBudgets({ scan: 0 }).scan).toBe(0);
    expect(resolveBudgets({ scan: 12345 }).scan).toBe(12345);
  });

  it('null unbounds ONLY its own axis; the others keep their defaults', () => {
    const b = resolveBudgets({ scan: null });
    expect(b.scan).toBeNull();
    for (const axis of BUDGET_AXES) {
      if (axis === 'scan') continue;
      expect(b[axis], axis).toBe(DEFAULT_BUDGETS[axis]);
    }
  });

  it.each(REJECTED)('the session refuses %s fail-closed instead of searching unlimited', (_label, value) => {
    expect(() => dnaGappedSearchSession(QUERY, TARGET, {
      thresholdBps: 8000,
      budgets: { verifier: value },
    })).toThrow();
  });

  it.each(REJECTED)('the legacy stateBudget also refuses %s', (_label, value) => {
    expect(() => dnaGappedSearchSession(QUERY, TARGET, {
      thresholdBps: 8000,
      stateBudget: value,
    })).toThrow();
  });

  it('a legal session on the same input still succeeds — the guard is not a blanket refusal', () => {
    const s = dnaGappedSearchSession(QUERY, TARGET, { thresholdBps: 8000 });
    expect(s.occurrences.length).toBeGreaterThan(0);
    const legal = dnaGappedSearchSession(QUERY, TARGET, {
      thresholdBps: 8000,
      budgets: { scan: null, verifier: 1_000_000 },
      stateBudget: null,
    });
    expect(legal.occurrences.length).toBeGreaterThan(0);
  });
});
