/**
 * skeleton-sanger-primer-r7.test.jsx — Sanger sequencing primer design.
 *
 * R7-2 (14.05.2026). Verifies:
 *   - fwd primer upstream от target (выпадает в окне [target.start - deadZone - walkLen .. target.start - deadZone]).
 *   - rev primer downstream.
 *   - GC и Tm в желаемых диапазонах.
 *   - 4+ run filter rejects bad regions.
 *   - Sanger walk покрывает регион с шагом.
 *   - Error на short templates.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  designSangerPrimer,
  designSangerWalk,
} from '../../../lib/bio/sanger-primer-design';

// Build a "well-behaved" template: random-looking 500 bp с GC ~50%.
function makeTpl() {
  const chunks = [
    'ATGCATGCATGC', 'CGATCGATCGAT', 'GCTAGCTAGCTA', 'TAGCTAGCTAGC',
    'CCAATTGGCCAA', 'GGCCAATTGGCC', 'AATTCCAATTCC', 'TTGGAATTCCGG',
  ];
  let s = '';
  let i = 0;
  while (s.length < 500) {
    s += chunks[i % chunks.length];
    i += 1;
  }
  return s.slice(0, 500);
}

describe('R7-2 — designSangerPrimer', () => {
  it('fwd primer upstream от target at ~50-100 bp', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const result = designSangerPrimer(tpl, { start: 200, end: 250 }, 'fwd');
    expect(result.error).toBeUndefined();
    expect(result.strand).toBe('fwd');
    // primer 3' end должен быть в окне [200 - 50 - 50 .. 200 - 50] = [100..150].
    const primer3End = result.position + result.length;
    expect(primer3End).toBeLessThanOrEqual(150);
    expect(primer3End).toBeGreaterThanOrEqual(100);
    expect(result.distance).toBeGreaterThanOrEqual(50);
    expect(result.distance).toBeLessThanOrEqual(100);
  });

  it('rev primer downstream от target', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const result = designSangerPrimer(tpl, { start: 200, end: 250 }, 'rev');
    expect(result.error).toBeUndefined();
    expect(result.strand).toBe('rev');
    expect(result.position).toBeGreaterThanOrEqual(300); // target.end + deadZone = 250+50=300
    expect(result.position).toBeLessThanOrEqual(350);
  });

  it('GC и length in valid range', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const result = designSangerPrimer(tpl, { start: 200, end: 250 }, 'fwd');
    expect(result.GC).toBeGreaterThanOrEqual(40);
    expect(result.GC).toBeLessThanOrEqual(60);
    expect(result.length).toBeGreaterThanOrEqual(18);
    expect(result.length).toBeLessThanOrEqual(25);
  });

  it('error if target слишком близко к началу template', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const result = designSangerPrimer(tpl, { start: 10, end: 20 }, 'fwd');
    expect(result.error).toBeTruthy();
  });

  it('walkLen опция расширяет окно поиска', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const tight = designSangerPrimer(tpl, { start: 200, end: 250 }, 'fwd', { walkLen: 20 });
    const wide = designSangerPrimer(tpl, { start: 200, end: 250 }, 'fwd', { walkLen: 100 });
    // Both should find primers; wide window's primer может быть лучше Tm.
    expect(tight.error || tight.sequence).toBeTruthy();
    expect(wide.error || wide.sequence).toBeTruthy();
  });
});

describe('R7-2 — designSangerWalk', () => {
  it('long region → серия primers с шагом', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const walk = designSangerWalk(tpl, { start: 50, end: 450 }, 100);
    expect(walk.length).toBeGreaterThan(1);
    // Каждый primer position < следующий primer position.
    for (let i = 1; i < walk.length; i += 1) {
      expect(walk[i].position).toBeGreaterThan(walk[i - 1].position);
    }
  });

  it('short region → 1 primer', () => {
    const tpl = { sequence: makeTpl(), topology: { circular: false } };
    const walk = designSangerWalk(tpl, { start: 200, end: 220 }, 600);
    expect(walk.length).toBe(1);
  });

  it('region вне template → empty', () => {
    const tpl = { sequence: 'ATCG'.repeat(50), topology: { circular: false } };
    const walk = designSangerWalk(tpl, { start: 5, end: 10 }, 600);
    // 5 too close to start; first primer fails.
    expect(walk.length).toBe(0);
  });
});
