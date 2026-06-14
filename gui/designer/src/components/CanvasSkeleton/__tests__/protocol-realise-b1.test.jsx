/**
 * protocol-realise-b1.test.jsx — audit B1/B2. After «Realise as DAG» the
 * assembly ops are status:'committed' (a plan), but buildProtocol kept only
 * status==='executed' → the protocol was EMPTY after realise, and stepPCR never
 * read the per-op userPrimers, so even when shown the PCR step had no primers.
 * The protocol now includes realised committed ops (ordered by pipeline x) and
 * stepPCR reads op.params.userPrimers.
 */
import { describe, it, expect } from 'vitest';
import { buildProtocol } from '../canvas/operations/protocol-export';

const containers = [
  { id: 'src', name: 'pUC19', sequence: 'ATGC', annotations: [] },
  { id: 'frag1', name: 'asm-frag-1', sequence: 'ATGC', annotations: [] },
  { id: 'prod', name: 'asm-product', sequence: 'ATGCATGC', annotations: [] },
];

const realisedOps = [
  {
    id: 'pcr1', kind: 'pcr', status: 'committed', position: { x: 80, y: 480 },
    inputs: ['src'], outputs: ['frag1'],
    params: { userPrimers: [{ forward: 'GGGGTCTCAprimerFWD', reverse: 'CCCprimerREV', fwdTm: 61, revTm: 60 }] },
    origin: { kind: 'realised', assemblyId: 'z', revision: 1, segmentId: 's1' },
  },
  {
    id: 'asm1', kind: 'golden_gate', status: 'committed', position: { x: 360, y: 480 },
    inputs: ['frag1', 'frag2'], outputs: ['prod'],
    params: { method: 'golden_gate', enzyme: 'BsmBI' },
    origin: { kind: 'realised-assembly', assemblyId: 'z', revision: 1 },
  },
];

describe('buildProtocol — realised ops (B1)', () => {
  it('includes realised committed ops (was empty after realise)', () => {
    const { text, steps } = buildProtocol(realisedOps, containers);
    expect(steps.length).toBe(2);
    expect(text).toContain('Операций выполнено: 2');
    expect(text).not.toContain('Нет выполненных операций');
  });

  it('names the chosen Golden Gate enzyme on the realised assembly step', () => {
    const { text } = buildProtocol(realisedOps, containers);
    expect(text).toContain('Golden Gate');
    expect(text).toContain('BsmBI');
  });

  it('the realised PCR step lists the userPrimers (forward + reverse)', () => {
    const { text } = buildProtocol(realisedOps, containers);
    expect(text).toContain('GGGGTCTCAprimerFWD');
    expect(text).toContain('CCCprimerREV');
  });

  it('orders steps by pipeline x (fragment PCR before the assembly join)', () => {
    const { steps } = buildProtocol(realisedOps, containers);
    expect(steps[0].title).toMatch(/PCR/);
    expect(steps[1].title).toMatch(/Golden Gate/);
  });

  it('still works for classic executed ops (back-compat)', () => {
    const ts = '2026-06-14T00:00:00.000Z';
    const { steps } = buildProtocol([
      { id: 'e1', kind: 'pcr', status: 'executed', executedAt: ts, inputs: ['src'], outputs: ['frag1'], params: {} },
    ], containers);
    expect(steps.length).toBe(1);
  });
});
