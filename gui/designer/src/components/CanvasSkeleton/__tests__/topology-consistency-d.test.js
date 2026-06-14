/**
 * topology-consistency-d.test.js — audit TOP-1 / TOP-5. Topology had two rival
 * fields (zone.topology vs the never-updated zone.finalTopology); the auto-group
 * pipeline read the stale one (so a user-set-linear assembly stayed circular),
 * and .bodge export dropped the authoritative topology/method/junctions entirely.
 */
import { describe, it, expect } from 'vitest';
import { autoGroupPipeline } from '../lib/auto-group-pipeline';
import { writeAssemblyJson, readAssemblyJson } from '../../../lib/bodge-assembly-json';

// 9 ungrouped sources (> 6 → the pipeline builds a layer-1 closing op whose kind
// depends on topology: gibson for circular, overlap_pcr for linear).
function nineSourceState(zoneId) {
  const pieces = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i}`, kind: 'sourced', zoneId, groupId: null,
    acquisitionMethod: 'cursor', createdAt: i + 1,
  }));
  return { pieces };
}

describe('TOP-1 — autoGroupPipeline reads the authoritative zone.topology', () => {
  it('circular zone (>6 sources) → a layer-1 gibson closing op', () => {
    const plan = autoGroupPipeline({ id: 'z', topology: { circular: true } }, nineSourceState('z'));
    const layer1 = plan.groups.find((g) => g.layer === 1);
    expect(layer1).toBeTruthy();
    expect(layer1.kind).toBe('gibson');
  });

  it('linear zone (topology.circular=false) → single overlap_pcr layer, NO gibson closing op', () => {
    const plan = autoGroupPipeline({ id: 'z', topology: { circular: false } }, nineSourceState('z'));
    expect(plan.groups.find((g) => g.layer === 1)).toBeUndefined(); // no ring-closing layer
    expect(plan.groups.every((g) => g.kind === 'overlap_pcr')).toBe(true);
  });

  it('legacy zone (no topology) falls back to finalTopology=linear → no gibson layer', () => {
    const plan = autoGroupPipeline({ id: 'z', finalTopology: 'linear' }, nineSourceState('z'));
    expect(plan.groups.find((g) => g.layer === 1)).toBeUndefined();
  });
});

describe('TOP-5 — .bodge round-trips topology / assemblyMethod / junctions', () => {
  it('a circular zone with method + junctions survives write→read', () => {
    const zone = {
      id: 'zn-1', name: 'Plasmid', bounds: { x: 0, y: 0, width: 600, height: 400 },
      topology: { circular: true }, assemblyMethod: 'gibson',
      junctions: { a__b: { method: 'gibson', autoMode: 'manual' } },
    };
    const back = readAssemblyJson(writeAssemblyJson({ zone }));
    expect(back.zone.topology).toEqual({ circular: true });
    expect(back.zone.assemblyMethod).toBe('gibson');
    expect(back.zone.junctions.a__b.method).toBe('gibson');
  });

  it('a linear zone round-trips circular:false (not silently re-circularized)', () => {
    const zone = {
      id: 'zn-2', name: 'Linear', bounds: { x: 0, y: 0, width: 600, height: 400 },
      topology: { circular: false },
    };
    const back = readAssemblyJson(writeAssemblyJson({ zone }));
    expect(back.zone.topology).toEqual({ circular: false });
  });
});
