/**
 * primer-flank.test.js — Игорь 18.05.2026: «выбор двух праймеров
 * выделяет фрагмент, фланкируемый ими».
 *
 * flankedSpan(a, b) → the amplicon a forward+reverse pair brackets:
 * [min(start), max(end)] over the two resolved primer hits. Only an
 * OPPOSITE-direction pair (fwd+rev / rev+fwd) flanks a product; same-
 * direction pairs (fwd-fwd / rev-rev) → null. null on missing input.
 */
import { describe, it, expect } from 'vitest';
import { flankedSpan } from '../primer-flank';

const hit = (start, end, direction) => ({ start, end, direction });

describe('flankedSpan', () => {
  it('fwd then rev → spans from fwd.start to rev.end', () => {
    expect(flankedSpan(hit(10, 30, 'forward'), hit(200, 224, 'reverse')))
      .toEqual({ start: 10, end: 224 });
  });

  it('order-independent (rev passed first)', () => {
    expect(flankedSpan(hit(200, 224, 'reverse'), hit(10, 30, 'forward')))
      .toEqual({ start: 10, end: 224 });
  });

  it('overlapping primers → still the outer bracket', () => {
    expect(flankedSpan(hit(50, 80, 'forward'), hit(60, 90, 'reverse')))
      .toEqual({ start: 50, end: 90 });
  });

  // Biological invariant (Игорь 18.05.2026): only fwd+rev flanks an
  // amplicon — same-direction pairs must NOT highlight.
  it('fwd + fwd → null (no amplicon between same-direction primers)', () => {
    expect(flankedSpan(hit(5, 25, 'forward'), hit(100, 120, 'forward'))).toBeNull();
  });

  it('rev + rev → null', () => {
    expect(flankedSpan(hit(5, 25, 'reverse'), hit(100, 120, 'reverse'))).toBeNull();
  });

  it('same primer twice (same direction) → null', () => {
    expect(flankedSpan(hit(5, 25, 'forward'), hit(5, 25, 'forward'))).toBeNull();
  });

  it('rev + fwd → spans (opposite, order-independent)', () => {
    expect(flankedSpan(hit(200, 224, 'reverse'), hit(10, 30, 'forward')))
      .toEqual({ start: 10, end: 224 });
  });

  it('missing / invalid input → null (no highlight)', () => {
    expect(flankedSpan(null, hit(1, 2))).toBeNull();
    expect(flankedSpan(hit(1, 2), undefined)).toBeNull();
    expect(flankedSpan({ start: 'x' }, hit(1, 2))).toBeNull();
  });

  it('normalises reversed coords on a hit (end<start)', () => {
    expect(flankedSpan(hit(30, 10, 'forward'), hit(224, 200, 'reverse')))
      .toEqual({ start: 10, end: 224 });
  });
});
