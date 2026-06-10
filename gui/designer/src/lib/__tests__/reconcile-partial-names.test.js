/**
 * reconcile-partial-names.test.js — fragment naming reconciliation.
 *
 * Биолог: «кусок с парт, не кусок без парт; показывать одно имя».
 * Когда детект (Level 1) находит, что подтверждённая фича `X` на самом деле
 * фрагмент известной фичи (`X_part_A-B`), на одном месте оказываются ДВЕ
 * сущности: импортная плоская `X` и предсказанный партиал. Надо свести к
 * одной: подтверждённая берёт part-имя (фрагмент → с part), предсказанный
 * дубль поглощается. Полный матч → имя без part.
 */
import { describe, it, expect } from 'vitest';
import { reconcileConfirmedWithPartials, basePartName, mergeStripWithPredicted } from '../annotation-edit.js';

describe('basePartName', () => {
  it('strips the _part_X-Y suffix, leaves plain names alone', () => {
    expect(basePartName('AmpR_part_10-856')).toBe('AmpR');
    expect(basePartName('KanR_part_1-400')).toBe('KanR');
    expect(basePartName('AmpR')).toBe('AmpR');
    expect(basePartName('lacZα')).toBe('lacZα');
  });
});

describe('reconcileConfirmedWithPartials — fragment shows part name, one feature', () => {
  it('confirmed X + overlapping predicted X_part_… → confirmed displays the part name, predicted absorbed', () => {
    const confirmed = [{ id: 'c', name: 'AmpR', type: 'CDS', start: 0, end: 847, level: 'region' }];
    const predicted = [{ id: 'p', name: 'AmpR_part_10-856', type: 'CDS', start: 0, end: 847, level: 'region', predicted: true }];
    const out = reconcileConfirmedWithPartials(confirmed, predicted);
    expect(out.confirmed[0].name).toBe('AmpR_part_10-856'); // part name wins (fragment)
    expect(out.predicted).toHaveLength(0);                  // duplicate absorbed
  });

  it('full match (predicted name == confirmed, no _part_) → no upgrade, both kept', () => {
    const confirmed = [{ id: 'c', name: 'AmpR', type: 'CDS', start: 0, end: 861, level: 'region' }];
    const predicted = [{ id: 'p', name: 'AmpR', type: 'CDS', start: 0, end: 861, level: 'region', predicted: true }];
    const out = reconcileConfirmedWithPartials(confirmed, predicted);
    expect(out.confirmed[0].name).toBe('AmpR'); // full → plain name, no part
    expect(out.predicted).toHaveLength(1);
  });

  it('different base name → untouched', () => {
    const confirmed = [{ id: 'c', name: 'lacZ', type: 'CDS', start: 0, end: 500, level: 'region' }];
    const predicted = [{ id: 'p', name: 'AmpR_part_10-856', type: 'CDS', start: 0, end: 500, level: 'region', predicted: true }];
    const out = reconcileConfirmedWithPartials(confirmed, predicted);
    expect(out.confirmed[0].name).toBe('lacZ');
    expect(out.predicted).toHaveLength(1);
  });

  it('no overlap → untouched (same base name but different locus)', () => {
    const confirmed = [{ id: 'c', name: 'AmpR', type: 'CDS', start: 0, end: 300, level: 'region' }];
    const predicted = [{ id: 'p', name: 'AmpR_part_10-856', type: 'CDS', start: 600, end: 900, level: 'region', predicted: true }];
    const out = reconcileConfirmedWithPartials(confirmed, predicted);
    expect(out.confirmed[0].name).toBe('AmpR');
    expect(out.predicted).toHaveLength(1);
  });

  it('preserves the original confirmed name on the upgraded region (displayBaseName)', () => {
    const confirmed = [{ id: 'c', name: 'AmpR', type: 'CDS', start: 0, end: 847, level: 'region' }];
    const predicted = [{ id: 'p', name: 'AmpR_part_10-856', type: 'CDS', start: 0, end: 847, level: 'region', predicted: true }];
    const out = reconcileConfirmedWithPartials(confirmed, predicted);
    expect(out.confirmed[0].displayBaseName).toBe('AmpR');
  });
});

describe('mergeStripWithPredicted — reconcile gated by showDuplicates (V136)', () => {
  const confirmed = [{ id: 'c', name: 'AmpR', type: 'CDS', start: 0, end: 332, level: 'region' }];
  const results = {
    L1: { regions: [{ id: 'p', name: 'AmpR_part_10-300', type: 'CDS', start: 0, end: 332, level: 'region', predicted: true, confidence: 1 }] },
  };

  it('showDuplicates OFF → one feature, part name (reconciled)', () => {
    const out = mergeStripWithPredicted(confirmed, results, 0, {}, {}, false);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('AmpR_part_10-300');
  });

  it('showDuplicates ON → both shown, confirmed name unchanged (no reconcile)', () => {
    const out = mergeStripWithPredicted(confirmed, results, 0, {}, {}, true);
    expect(out).toHaveLength(2);
    expect(out.some((r) => r.name === 'AmpR')).toBe(true);
    expect(out.some((r) => r.name === 'AmpR_part_10-300')).toBe(true);
  });
});
