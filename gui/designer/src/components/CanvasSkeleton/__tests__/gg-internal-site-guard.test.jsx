/**
 * gg-internal-site-guard.test.jsx — audit GG-1/GG-2. A Type IIS (Golden Gate)
 * assembly fails if any fragment carries an INTERNAL recognition site — the
 * enzyme cuts the fragment internally. The adapter blocks the operation and
 * suggests an alternative enzyme.
 */
import { describe, it, expect } from 'vitest';
import { executeGoldenGate } from '../canvas/operations/adapters/golden-gate';

// f1 carries an internal BsaI site (GGTCTC) but no other Type IIS site; f2 clean.
const F1 = { id: 'f1', name: 'frag1', sequence: 'AAAGGTCTCAAATTTCCCGGGAAA', topology: { circular: false }, annotations: [] };
const F2 = { id: 'f2', name: 'frag2', sequence: 'TTTAAACCCGGGTTTAAACCCGGG', topology: { circular: false }, annotations: [] };

describe('executeGoldenGate — internal-site guard (GG-1)', () => {
  it('blocks assembly when a fragment has an internal BsaI site, suggesting an alternative', () => {
    const ctx = { containers: { f1: F1, f2: F2 } };
    const r = executeGoldenGate({ id: 'op', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: true } }, ctx);
    expect(r.error).toBeTruthy();
    expect(r.error).toMatch(/BsaI/);
    expect(r.error).toMatch(/попробуйте/); // suggested alternative enzyme
  });

  it('proceeds for a clean enzyme with no internal sites', () => {
    const ctx = { containers: { f1: F1, f2: F2 } };
    // BpiI recognition (GAAGAC) is absent from both → assembly proceeds.
    const r = executeGoldenGate({ id: 'op', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BpiI', circular: true } }, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs).toHaveLength(1);
  });
});
