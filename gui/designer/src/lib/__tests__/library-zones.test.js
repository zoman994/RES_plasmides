/**
 * library-zones — Sprint M-X.7a v2 K1.
 *
 * `classifyEntryZone(entry, ctx)` derives the canonical zone label
 * from an entry shape. Used to:
 *   • Derive a zone for legacy / pre-v2 entries (post-wipe should
 *     never apply, but the helper is defensive).
 *   • Pick the right action-row variant in K3 (`getActionsFor`).
 *   • Drive zone-aware initial state of `useEditableModeToggle`.
 *
 * Returns one of: 'loose' | 'active_bodge' | 'readonly_bodge' | 'lab_pool'.
 */
import { describe, it, expect } from 'vitest';
import { classifyEntryZone } from '../library-zones';

describe('M-X.7a v2 K1 — classifyEntryZone', () => {
  it('returns explicit zone field when present and valid', () => {
    expect(classifyEntryZone({ zone: 'loose' })).toBe('loose');
    expect(classifyEntryZone({ zone: 'active_bodge' })).toBe('active_bodge');
    expect(classifyEntryZone({ zone: 'readonly_bodge' })).toBe('readonly_bodge');
    expect(classifyEntryZone({ zone: 'lab_pool' })).toBe('lab_pool');
  });

  it('ignores invalid zone field and re-derives', () => {
    const e = { zone: 'invalid_zone', kind: 'container' };
    expect(classifyEntryZone(e)).toBe('loose');
  });

  it('primer with inLabStock=true → "lab_pool"', () => {
    const e = { kind: 'primer', inLabStock: true };
    expect(classifyEntryZone(e)).toBe('lab_pool');
  });

  it('primer with inLabStock=false and no projectId → "loose"', () => {
    const e = { kind: 'primer', inLabStock: false };
    expect(classifyEntryZone(e)).toBe('loose');
  });

  it('container with projectId matching active project → "active_bodge"', () => {
    const e = { kind: 'container', projectId: 'p1' };
    expect(classifyEntryZone(e, { activeProjectId: 'p1' })).toBe('active_bodge');
  });

  it('container with projectId NOT matching active project → "readonly_bodge"', () => {
    const e = { kind: 'container', projectId: 'p2' };
    expect(classifyEntryZone(e, { activeProjectId: 'p1' })).toBe('readonly_bodge');
  });

  it('container with projectId but no active project context → "readonly_bodge"', () => {
    const e = { kind: 'container', projectId: 'p1' };
    expect(classifyEntryZone(e)).toBe('readonly_bodge');
  });

  it('container with no projectId → "loose"', () => {
    const e = { kind: 'container' };
    expect(classifyEntryZone(e)).toBe('loose');
  });

  it('null / undefined entry → "loose" (defensive default)', () => {
    expect(classifyEntryZone(null)).toBe('loose');
    expect(classifyEntryZone(undefined)).toBe('loose');
  });

  it('empty object → "loose"', () => {
    expect(classifyEntryZone({})).toBe('loose');
  });
});
