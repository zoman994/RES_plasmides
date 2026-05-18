/**
 * library-zones — Sprint M-X.7c K3 (DEC-UIRREV-ZONES-MERGE-01).
 *
 * `classifyEntryZone(entry)` returns one of two zones:
 *   • 'loose' — entry not bound to any project.
 *   • 'bodge' — entry has a `projectId`.
 *
 * Legacy four-value enum (`active_bodge | readonly_bodge | lab_pool`)
 * is migrated lazily into the canonical pair via `entry.projectId`.
 */
import { describe, it, expect } from 'vitest';
import { classifyEntryZone, LIBRARY_ZONES } from '../library-zones';

describe('M-X.7c K3 — classifyEntryZone (2-zone canon)', () => {
  it('returns explicit canonical zone field when present', () => {
    expect(classifyEntryZone({ zone: 'loose' })).toBe('loose');
    expect(classifyEntryZone({ zone: 'bodge', projectId: 'p1' })).toBe('bodge');
  });

  it('legacy zones fall back to projectId-derivation', () => {
    expect(classifyEntryZone({ zone: 'active_bodge', projectId: 'p1' })).toBe('bodge');
    expect(classifyEntryZone({ zone: 'readonly_bodge', projectId: 'p2' })).toBe('bodge');
    // Lab pool primer with no projectId → loose (Lab pool is now a View).
    expect(classifyEntryZone({ zone: 'lab_pool', kind: 'primer', inLabStock: true })).toBe('loose');
    // Lab pool primer with projectId → bodge (the project owns it).
    expect(classifyEntryZone({ zone: 'lab_pool', kind: 'primer', projectId: 'p1' })).toBe('bodge');
  });

  it('primer with inLabStock=true and no projectId → loose (Lab pool is no longer a Zone)', () => {
    const e = { kind: 'primer', inLabStock: true };
    expect(classifyEntryZone(e)).toBe('loose');
  });

  it('container with projectId → "bodge" regardless of active context', () => {
    const e = { kind: 'container', projectId: 'p1' };
    expect(classifyEntryZone(e)).toBe('bodge');
    // ctx.activeProjectId is now ignored — active/readonly is a UI concept.
    expect(classifyEntryZone(e, { activeProjectId: 'p1' })).toBe('bodge');
    expect(classifyEntryZone(e, { activeProjectId: 'pOther' })).toBe('bodge');
  });

  it('container with no projectId → "loose"', () => {
    expect(classifyEntryZone({ kind: 'container' })).toBe('loose');
  });

  it('null / undefined / empty → "loose" (defensive default)', () => {
    expect(classifyEntryZone(null)).toBe('loose');
    expect(classifyEntryZone(undefined)).toBe('loose');
    expect(classifyEntryZone({})).toBe('loose');
  });

  it('invalid zone field falls through to projectId derivation', () => {
    expect(classifyEntryZone({ zone: 'made_up' })).toBe('loose');
    expect(classifyEntryZone({ zone: 'made_up', projectId: 'p1' })).toBe('bodge');
  });

  it('LIBRARY_ZONES exports canonical 2-value list', () => {
    expect(LIBRARY_ZONES).toEqual(['loose', 'bodge']);
  });
});
