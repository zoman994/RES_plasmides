/**
 * skeleton-adapters-s2.test.jsx — Real algorithm fidelity для adapters.
 *
 * S2 (14.05.2026 — TIER-S):
 *   1. executeCut использует digest() для circular templates — output
 *      содержит правильные ends (sticky / blunt) + annotations
 *      shifted.
 *   2. executeGibson trims overlap'ы 15-40 bp.
 *   3. executeGoldenGate trims Type IIS recognition sites + overlap.
 *   4. executePCR slice'ит template по primer positions.
 *   5. executeLigate sticky-end overlap-aware concat.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  executeCut,
  executeGibson,
  executeGoldenGate,
  executePCR,
  executeLigate,
} from '../canvas/operations/lib-adapters';

describe('S2 — executeCut real fidelity (digest path)', () => {
  it('EcoRI on circular pUC-style → backbone with sticky ends', () => {
    // pUC has single EcoRI site at ~396. Make a mini circular with GAATTC.
    const seq = 'AAAATTTTGGGGCCCCGAATTCCCGGGGAAAAATTTTTGGGGGCCCCC';
    const tpl = {
      id: 'c-circ', name: 'mini-puc', kind: 'molecule',
      sequence: seq, topology: { circular: true },
      annotations: [],
    };
    const op = { id: 'op-1', kind: 'cut', params: { templateId: 'c-circ', enzymes: ['EcoRI'] }, inputs: ['c-circ'] };
    const result = executeCut(op, { containers: { 'c-circ': tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs.length).toBeGreaterThan(0);
    const linearized = result.outputs[0];
    expect(linearized.ends).toBeTruthy(); // ends info populated
    expect(linearized.topology.circular).toBe(false);
  });

  it('No sites → error «Нет сайтов рестрикции»', () => {
    const tpl = { id: 'c', name: 'X', kind: 'molecule', sequence: 'TTTTTTTT', topology: { circular: true } };
    const op = { id: 'op-1', kind: 'cut', params: { templateId: 'c', enzymes: ['EcoRI'] }, inputs: ['c'] };
    const result = executeCut(op, { containers: { c: tpl } });
    expect(result.error).toMatch(/Нет сайтов/);
  });
});

describe('S2 — executeGibson overlap trimming', () => {
  it('20-bp overlap между fragments → не дублируется в assembly', () => {
    const overlap = 'AAAACCCCGGGGTTTTAAAA'; // 20 bp
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'TTTTTTTTTTTTTTTT' + overlap };
    const f2 = { id: 'f2', kind: 'molecule', sequence: overlap + 'CCCCCCCCCCCCCCCC' };
    const op = { id: 'op-g', kind: 'gibson', params: { fragmentIds: ['f1', 'f2'], circular: false } };
    const result = executeGibson(op, { containers: { f1, f2 } });
    expect(result.outputs[0].sequence).toBe('TTTTTTTTTTTTTTTT' + overlap + 'CCCCCCCCCCCCCCCC');
    // Overlap'ы записаны в origin.
    expect(result.outputs[0].origin.overlaps).toContain(20);
  });

  it('Без overlap → simple concat (но origin.missingOverlap > 0)', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'AAAA' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GGGG' };
    const op = { id: 'op-g', kind: 'gibson', params: { fragmentIds: ['f1', 'f2'], circular: false } };
    const result = executeGibson(op, { containers: { f1, f2 } });
    expect(result.outputs[0].sequence).toBe('AAAAGGGG');
    expect(result.outputs[0].origin.missingOverlap).toBeGreaterThan(0);
  });
});

describe('S2 — executeGoldenGate trims Type IIS recog sites', () => {
  it('BsaI sites GGTCTC actually at fragment edge → trimmed', () => {
    // Frag 1: ENDS with BsaI recognition site (GGTCTC).
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'AAAAGGTCTC' };
    // Frag 2: STARTS with BsaI recognition site.
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GGTCTCTGGGG' };
    const op = { id: 'op-gg', kind: 'golden_gate', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: false } };
    const result = executeGoldenGate(op, { containers: { f1, f2 } });
    // f1 trim trailing GGTCTC (6 chars) → "AAAA"; f2 trim leading → "TGGGG".
    // recogTrimmed = 12 (6 на каждой стороне).
    expect(result.outputs[0].origin.recogTrimmed).toBe(12);
    expect(result.outputs[0].sequence).toBe('AAAATGGGG');
  });

  it('No GGTCTC at edges → no trim (минимальное вмешательство)', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'ATCG' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GCAT' };
    const op = { id: 'op-gg', kind: 'golden_gate', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: false } };
    const result = executeGoldenGate(op, { containers: { f1, f2 } });
    expect(result.outputs[0].sequence).toBe('ATCGGCAT');
    expect(result.outputs[0].origin.recogTrimmed).toBe(0);
  });
});

describe('S2 — executePCR with explicit primers', () => {
  it('Slice template by forward + reverse primer positions', () => {
    // Template with known fwd + rev RC.
    const fwd = 'ATGCATGC';
    const rev = 'AAAAGGGG'; // RC = CCCCTTTT
    const tpl = { id: 't', kind: 'molecule', sequence: 'AAAA' + fwd + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT' };
    const oligo = {
      id: 'oligo-1', kind: 'oligonucleotide',
      payload: {
        sequences: [
          { name: 'fwd', sequence: fwd },
          { name: 'rev', sequence: rev },
        ],
      },
    };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: { templateId: 't', primerPairId: 'oligo-1', autoDesign: false },
      inputs: ['t'],
    };
    const result = executePCR(op, { containers: { t: tpl, 'oligo-1': oligo } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe(fwd + 'GCGCGCGC' + 'CCCCTTTT');
    expect(result.outputs[0].origin.fwdStart).toBe(4);
  });

  it('Auto-design (no primers) → full template returned as amplicon', () => {
    const tpl = { id: 't', kind: 'molecule', sequence: 'ATGCATGC' };
    const op = { id: 'op-p', kind: 'pcr', params: { templateId: 't', autoDesign: true }, inputs: ['t'] };
    const result = executePCR(op, { containers: { t: tpl } });
    expect(result.outputs[0].sequence).toBe('ATGCATGC');
    expect(result.outputs[0].origin.autoDesign).toBe(true);
  });

  // V73 — primers written/selected in the viewer (op.params.userPrimers)
  // must be CONSUMED by execute, not ignored in favour of auto-design.
  it('V73 — op.params.userPrimers drives the amplicon (not auto-design)', () => {
    const fwd = 'ATGCATGC';
    const rev = 'AAAAGGGG'; // RC = CCCCTTTT
    const tpl = { id: 't', kind: 'molecule', sequence: 'AAAA' + fwd + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT' };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: {
        templateId: 't',
        userPrimers: [{
          forward: fwd, fwdBinding: fwd,
          reverse: rev, revBinding: rev,
          source: 'edited',
        }],
      },
      inputs: ['t'],
    };
    const result = executePCR(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe(fwd + 'GCGCGCGC' + 'CCCCTTTT');
    expect(result.outputs[0].origin.userPrimers).toBe(true);
    expect(result.outputs[0].origin.autoDesign).toBeUndefined();
  });

  it('V73 — userPrimers matched by BINDING seq (5′ tails ignored)', () => {
    const fwd = 'ATGCATGC';
    const rev = 'AAAAGGGG';
    const tpl = { id: 't', kind: 'molecule', sequence: 'AAAA' + fwd + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT' };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: {
        templateId: 't',
        userPrimers: [{
          forward: 'GGGGG' + fwd, fwdBinding: fwd, // 5′ tail on full seq
          reverse: 'CACCA' + rev, revBinding: rev,
          source: 'edited',
        }],
      },
      inputs: ['t'],
    };
    const result = executePCR(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe(fwd + 'GCGCGCGC' + 'CCCCTTTT');
  });

  // AM-PCR-OLIGO — the userPrimers branch must ALSO emit an oligonucleotide
  // output container (like the auto-design branch), otherwise the user's
  // designed primers are invisible to PrimerOrderPanel (oligo TSV/FASTA
  // export) and protocol-export (PCR primer lines / reagents block).
  it('AM-PCR-OLIGO — userPrimers branch emits amplicon + oligonucleotide outputs', () => {
    const fwd = 'ATGCATGC';
    const rev = 'AAAAGGGG'; // RC = CCCCTTTT
    const tpl = { id: 't', name: 'tpl', kind: 'molecule', sequence: 'AAAA' + fwd + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT' };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: {
        templateId: 't',
        userPrimers: [{
          forward: fwd, fwdBinding: fwd,
          reverse: rev, revBinding: rev,
          source: 'edited',
        }],
      },
      inputs: ['t'],
    };
    const result = executePCR(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs).toHaveLength(2);
    const amplicon = result.outputs[0];
    const oligo = result.outputs[1];
    expect(amplicon.kind).toBe('molecule');
    expect(oligo.kind).toBe('oligonucleotide');
    const seqs = oligo.payload.sequences;
    expect(seqs).toHaveLength(2);
    expect(seqs[0].sequence).toBe(fwd);
    expect(seqs[1].sequence).toBe(rev);
  });

  it('AM-PCR-OLIGO — emitted oligo carries the full ORDERED seq (with 5′ tail), Tm + name', () => {
    const fwd = 'ATGCATGC';
    const rev = 'AAAAGGGG';
    const tpl = { id: 't', name: 'tpl', kind: 'molecule', sequence: 'AAAA' + fwd + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT' };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: {
        templateId: 't',
        userPrimers: [{
          forward: 'GGGGG' + fwd, fwdBinding: fwd, fwdTm: 61.2, fwdName: 'myF',
          reverse: 'CACCA' + rev, revBinding: rev, revTm: 59.4, revName: 'myR',
          source: 'edited',
        }],
      },
      inputs: ['t'],
    };
    const result = executePCR(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    const oligo = result.outputs[1];
    const seqs = oligo.payload.sequences;
    // The vendor synthesises the FULL primer (tail included), not the binding region.
    expect(seqs[0].sequence).toBe('GGGGG' + fwd);
    expect(seqs[1].sequence).toBe('CACCA' + rev);
    expect(seqs[0].name).toBe('myF');
    expect(seqs[1].name).toBe('myR');
    expect(seqs[0].Tm).toBe(61.2);
    expect(seqs[1].Tm).toBe(59.4);
  });

  it('Forward primer не найден → error', () => {
    const tpl = { id: 't', kind: 'molecule', sequence: 'AAAA' };
    const oligo = {
      id: 'oligo-1', kind: 'oligonucleotide',
      payload: { sequences: [{ sequence: 'GGGG' }, { sequence: 'CCCC' }] },
    };
    const op = {
      id: 'op-p', kind: 'pcr',
      params: { templateId: 't', primerPairId: 'oligo-1', autoDesign: false },
    };
    const result = executePCR(op, { containers: { t: tpl, 'oligo-1': oligo } });
    expect(result.error).toMatch(/Forward primer не найден/);
  });
});

describe('S2 — executeLigate sticky-end overlap', () => {
  it('Sticky ends with 4-nt overlap (AATT) — trimmed', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'GGGGAATT' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'AATTCCCC' };
    const op = { id: 'op-l', kind: 'ligate', params: { fragmentIds: ['f1', 'f2'], ends: 'sticky', circular: false } };
    const result = executeLigate(op, { containers: { f1, f2 } });
    // After overlap trim of AATT (4 nt): GGGG + AATT + CCCC = 12 chars.
    expect(result.outputs[0].sequence).toBe('GGGGAATTCCCC');
    expect(result.outputs[0].origin.overlaps).toContain(4);
  });

  it('Blunt — pure concat без trim', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'AAAA' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GGGG' };
    const op = { id: 'op-l', kind: 'ligate', params: { fragmentIds: ['f1', 'f2'], ends: 'blunt', circular: false } };
    const result = executeLigate(op, { containers: { f1, f2 } });
    expect(result.outputs[0].sequence).toBe('AAAAGGGG');
  });
});
