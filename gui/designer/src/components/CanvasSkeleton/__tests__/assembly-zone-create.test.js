/**
 * assembly-zone-create.test.js — Игорь 18-19.05.2026: унификация
 * «Только зона» + regression-fix. One CREATE_ZONE entry point that
 * carries a CALLER-SIDE id so «+ Сборка» can open the new zone's
 * assembly editor (createZone honours the passed id).
 */
import { describe, it, expect } from 'vitest';
import { buildAssemblyZoneAction } from '../canvas/assembly-zone-create';

describe('buildAssemblyZoneAction', () => {
  it('no zones → CREATE_ZONE «Сборка 1» at the base rect', () => {
    const a = buildAssemblyZoneAction({ zones: [] });
    expect(a.type).toBe('CREATE_ZONE');
    expect(a.zone.name).toBe('Сборка 1');
    expect(a.zone.bounds).toEqual({
      x: 40, y: 40, width: 600, height: 400,
    });
  });

  it('carries a caller-side zn- id so create+open can chain', () => {
    const a = buildAssemblyZoneAction({ zones: [] });
    expect(typeof a.zone.id).toBe('string');
    expect(a.zone.id).toMatch(/^zn-/);
    // Each call → a distinct zone (open-on-create must target THIS one).
    const b = buildAssemblyZoneAction({ zones: [] });
    expect(b.zone.id).not.toBe(a.zone.id);
  });

  it('cascades name + position by existing zone count', () => {
    const a = buildAssemblyZoneAction({ zones: [{ id: 'z1' }, { id: 'z2' }] });
    expect(a.zone.name).toBe('Сборка 3');
    expect(a.zone.bounds).toEqual({
      x: 40 + 2 * 40, y: 40 + 2 * 40, width: 600, height: 400,
    });
  });

  it('missing state.zones → treated as empty (Сборка 1)', () => {
    expect(buildAssemblyZoneAction({}).zone.name).toBe('Сборка 1');
    expect(buildAssemblyZoneAction(null).zone.name).toBe('Сборка 1');
  });
});
