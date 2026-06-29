/**
 * primer-status — PRIMER-2 (Игорь /loop 28.06): lifecycle of a pool primer.
 * Pins the forward flow (entry → ordered → received → archived), Russian
 * labels, archive-from-anywhere, and rank ordering used by the pool list.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_STATUSES, statusMeta, statusLabel, nextStatus, statusRank, isTerminal,
} from '../primer-status';

describe('primer-status', () => {
  it('exposes the five canonical statuses (matches primerSlice VALID_STATUSES)', () => {
    expect(ALL_STATUSES).toEqual(['imported', 'designed', 'ordered', 'received', 'archived']);
  });

  it('every status has a Russian label + colors', () => {
    for (const s of ALL_STATUSES) {
      const m = statusMeta(s);
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#/);
      expect(m.bg).toMatch(/^#/);
    }
    expect(statusLabel('ordered')).toBe('Заказан');
    expect(statusLabel('received')).toBe('Получен');
    expect(statusLabel('archived')).toBe('В архиве');
  });

  it('unknown status falls back to a generic meta (no crash)', () => {
    const m = statusMeta('bogus');
    expect(m.label).toBeTruthy();
    expect(m.color).toMatch(/^#/);
  });

  it('forward flow: entry states advance to ordered', () => {
    expect(nextStatus('imported')).toBe('ordered');
    expect(nextStatus('designed')).toBe('ordered');
  });

  it('forward flow: ordered → received → archived → null', () => {
    expect(nextStatus('ordered')).toBe('received');
    expect(nextStatus('received')).toBe('archived');
    expect(nextStatus('archived')).toBe(null);
  });

  it('isTerminal true only for archived', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('ordered')).toBe(false);
    expect(isTerminal('imported')).toBe(false);
  });

  it('statusRank orders entry < ordered < received < archived (for sorting)', () => {
    expect(statusRank('imported')).toBe(0);
    expect(statusRank('designed')).toBe(0);
    expect(statusRank('ordered')).toBe(1);
    expect(statusRank('received')).toBe(2);
    expect(statusRank('archived')).toBe(3);
    expect(statusRank('bogus')).toBe(0);
  });
});
