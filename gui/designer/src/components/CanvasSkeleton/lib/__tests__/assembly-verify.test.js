/**
 * S4 (V164) — verifyAssembly: ONE transparent "buildable + why-not" verdict
 * aggregating S1 readiness + S2 end-chemistry + S3 RE-cloning. Incompatible
 * sticky ends are the only BLOCKER (mirrors the Realise gate); everything else
 * is protocol guidance (WARNING) that doesn't stop the build.
 */
import { describe, it, expect } from 'vitest';
import { verifyAssembly } from '../assembly-verify.js';

describe('verifyAssembly', () => {
  it('incompatible sticky ends → BLOCKER, not buildable', () => {
    const v = verifyAssembly({ readiness: { total: 1, incompatible: 1, tentative: 0 } });
    expect(v.buildable).toBe(false);
    expect(v.blockers.map((b) => b.kind)).toContain('incompatible-ends');
  });

  it('a clean assembly with junctions → buildable, no issues', () => {
    const v = verifyAssembly({ readiness: { total: 2, incompatible: 0, tentative: 0 } });
    expect(v.buildable).toBe(true);
    expect(v.blockers).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
  });

  it('phosphorylation / sequential / dephos / tentative / no-enzyme are WARNINGS, still buildable', () => {
    const v = verifyAssembly({
      readiness: { total: 2, incompatible: 0, tentative: 1 },
      endChem: { needsPhosphorylationCount: 1, unresolvedTailCount: 1 },
      reCloning: { sequentialDigestCount: 1, dephosphorylationCount: 1 },
    });
    expect(v.buildable).toBe(true);
    expect(v.blockers).toHaveLength(0);
    const kinds = v.warnings.map((w) => w.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      'tentative', 'no-enzyme', 'phosphorylation', 'sequential-digest', 'dephosphorylation',
    ]));
  });

  it('no junctions yet → not buildable', () => {
    expect(verifyAssembly({ readiness: { total: 0 } }).buildable).toBe(false);
    expect(verifyAssembly({}).buildable).toBe(false);
  });

  it('blocker AND warnings coexist (blocker still wins buildability)', () => {
    const v = verifyAssembly({
      readiness: { total: 2, incompatible: 1, tentative: 0 },
      endChem: { needsPhosphorylationCount: 1 },
    });
    expect(v.buildable).toBe(false);
    expect(v.warnings.map((w) => w.kind)).toContain('phosphorylation');
  });
});
