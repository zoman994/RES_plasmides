/**
 * poa.test.js — Partial Order Alignment consensus (§A5). Verifies the DAG
 * collapses identical reads, resolves substitutions by majority, and — the
 * whole point vs column-voting — handles an indel in one read as a side branch
 * without corrupting the consensus.
 */
import { describe, it, expect } from 'vitest';
import { poaConsensus } from '../poa';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randSeq = (rng, len) => { let s = ''; for (let i = 0; i < len; i++) s += 'ACGT'[Math.floor(rng() * 4)]; return s; };
// Topo-sort graph.nodes from in-edges; returns processed count (== nodes.length iff acyclic).
function topoCount(nodes) {
  const deg = nodes.map((n) => n.in.size);
  const q = [];
  for (let i = 0; i < nodes.length; i++) if (deg[i] === 0) q.push(i);
  let seen = 0;
  while (q.length) { const u = q.shift(); seen += 1; for (const v of nodes[u].out.keys()) { deg[v] -= 1; if (deg[v] === 0) q.push(v); } }
  return seen;
}
const clean = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');

describe('poaConsensus — DAG consensus from overlapping reads', () => {
  it('identical reads → that sequence, every node carries all reads', () => {
    const seq = 'ACGTACGTACGT';
    const { consensus, graph } = poaConsensus([seq, seq, seq]);
    expect(consensus).toBe(seq);
    expect(graph.nodes.length).toBe(seq.length); // no branching
    expect(graph.nodes.every((n) => n.count === 3)).toBe(true);
  });

  it('a single substitution is outvoted by the majority', () => {
    // middle read has C→G at position 1
    const { consensus } = poaConsensus(['ACGTACGT', 'AGGTACGT', 'ACGTACGT']);
    expect(consensus).toBe('ACGTACGT');
  });

  it('an indel in one read is handled as a branch, not a frame shift', () => {
    // read 2 has an extra T after position 3; majority has none.
    const { consensus } = poaConsensus(['ACGTACGT', 'ACGTTACGT', 'ACGTACGT']);
    expect(consensus).toBe('ACGTACGT');
  });

  it('a deletion in one read is outvoted (majority keeps the base)', () => {
    const { consensus } = poaConsensus(['ACGTACGT', 'ACGACGT', 'ACGTACGT']); // read2 missing the T at idx3
    expect(consensus).toBe('ACGTACGT');
  });

  it('single read → itself', () => {
    expect(poaConsensus(['GATTACA']).consensus).toBe('GATTACA');
  });

  it('empty / whitespace input is ignored', () => {
    expect(poaConsensus(['', '   ', 'ACGT']).consensus).toBe('ACGT');
    expect(poaConsensus([]).consensus).toBe('');
  });

  it('majority of longer reads wins over a divergent short one', () => {
    const long = 'ATGCCGTTAGGCATCCGATT';
    const { consensus } = poaConsensus([long, long, 'ATGCAGTTAGGCATCCGATT']); // 1 sub in read 3
    expect(consensus).toBe(long);
  });

  // ── Structural invariants (adversarial-review §A5: refute double-count / cycle
  //    / duplicate-sibling concerns empirically over fuzzed reads). ──────────
  it('graph stays acyclic and node counts sum to total bases (no double-count)', () => {
    const rng = mulberry32(0x90A5);
    for (let t = 0; t < 60; t++) {
      const base = randSeq(rng, 20 + Math.floor(rng() * 30));
      const reads = [];
      const nReads = 2 + Math.floor(rng() * 5);
      for (let r = 0; r < nReads; r++) {
        // mutate base with a few subs/indels
        let s = base.split('');
        const edits = Math.floor(rng() * 4);
        for (let e = 0; e < edits; e++) {
          const p = Math.floor(rng() * s.length);
          const k = rng();
          if (k < 0.5) s[p] = 'ACGT'[Math.floor(rng() * 4)];       // sub
          else if (k < 0.75) s.splice(p, 1);                        // del
          else s.splice(p, 0, 'ACGT'[Math.floor(rng() * 4)]);       // ins
        }
        reads.push(s.join(''));
      }
      const { graph } = poaConsensus(reads);
      const totalBases = reads.reduce((acc, r) => acc + clean(r).length, 0);
      const countSum = graph.nodes.reduce((acc, n) => acc + n.count, 0);
      expect(countSum).toBe(totalBases);                       // no base counted twice or lost
      expect(topoCount(graph.nodes)).toBe(graph.nodes.length); // acyclic (full topo order)
    }
  });

  it('consensus is invariant to read order (no order-sensitive corruption)', () => {
    const reads = ['ACGTACGTAA', 'ACGTACGTAA', 'ACGTTACGTAA', 'ACGTACGAA'];
    const a = poaConsensus(reads).consensus;
    const b = poaConsensus([...reads].reverse()).consensus;
    const c = poaConsensus([reads[2], reads[0], reads[3], reads[1]]).consensus;
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});
