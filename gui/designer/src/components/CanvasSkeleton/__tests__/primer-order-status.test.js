/**
 * planOrderStatusUpdate (AUD-13) — ordering an oligo sheet must advance the
 * durable pool's status to «Заказан». Pure matcher: exported oligos → pool ids
 * to promote + sequences to add-then-promote.
 */
import { describe, it, expect } from 'vitest';
import { planOrderStatusUpdate } from '../PrimerOrderPanel';

describe('planOrderStatusUpdate', () => {
  it('matches exported oligos to pool primers by sequence (case-insensitive)', () => {
    const pool = [{ id: 'p1', sequence: 'ATGCATGC' }, { id: 'p2', sequence: 'GGGCCCTTT' }];
    const exported = [{ name: 'f', sequence: 'atgcatgc' }];
    const plan = planOrderStatusUpdate(exported, pool);
    expect(plan.matchIds).toEqual(['p1']);
    expect(plan.toAdd).toEqual([]);
  });

  it('collects exported oligos NOT in the pool as toAdd', () => {
    const pool = [{ id: 'p1', sequence: 'ATGCATGC' }];
    const exported = [{ name: 'newFwd', sequence: 'TTTTAAAA' }];
    const plan = planOrderStatusUpdate(exported, pool);
    expect(plan.matchIds).toEqual([]);
    expect(plan.toAdd).toEqual([{ name: 'newFwd', sequence: 'TTTTAAAA' }]);
  });

  it('dedupes so a repeated sequence promotes/adds once', () => {
    const pool = [{ id: 'p1', sequence: 'ATGCATGC' }];
    const exported = [
      { name: 'a', sequence: 'ATGCATGC' },
      { name: 'b', sequence: 'ATGCATGC' }, // same as pool p1 → one match id
      { name: 'c', sequence: 'CCCCGGGG' },
      { name: 'd', sequence: 'ccccgggg' }, // same new seq → one toAdd
    ];
    const plan = planOrderStatusUpdate(exported, pool);
    expect(plan.matchIds).toEqual(['p1']);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].sequence).toBe('CCCCGGGG');
  });

  it('empty inputs → empty plan', () => {
    expect(planOrderStatusUpdate([], [])).toEqual({ matchIds: [], toAdd: [] });
    expect(planOrderStatusUpdate(undefined, undefined)).toEqual({ matchIds: [], toAdd: [] });
  });
});
