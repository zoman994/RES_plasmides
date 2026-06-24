/**
 * poa.js — Partial Order Alignment (Lee, Grasso, Sharlow, Bioinformatics 2002)
 * + heaviest-bundle consensus (литобзор §A5). De-novo consensus / contig from N
 * overlapping reads WITHOUT a reference: each read is aligned into a DAG, then
 * the most-supported path through the DAG is the consensus. Unlike reference-
 * column voting (multi-align), POA models indels correctly — a read with an
 * extra/missing base becomes a side branch rather than shifting every downstream
 * column. Pure, client-side.
 *
 * Model: nucleotide, linear-gap scoring, SEMIGLOBAL placement of each read onto
 * the graph (free leading/trailing) so partial overlaps incorporate cleanly.
 * Mismatched bases aligned to the same column collapse into one node via an
 * "aligned ring" (so equal substitutions across reads share a node and their
 * edge weights add — essential for the consensus to reflect the majority).
 */
import { basesCompatible } from './align-pairwise';

const NEG = -Infinity;

/**
 * Build a POA graph and return the heaviest-bundle consensus.
 * @param {string[]} reads
 * @param {{match?:number,mismatch?:number,gap?:number}} [opts]
 * @returns {{consensus:string, nodeCount:number, graph:object}}
 */
export function poaConsensus(reads, opts = {}) {
  const match = opts.match ?? 2;
  const mismatch = opts.mismatch ?? -1;
  const gap = opts.gap ?? -2;

  const nodes = []; // { base, count, out:Map(id->w), in:Map(id->w), aligned:Set(id) }
  const addNode = (base) => {
    const id = nodes.length;
    nodes.push({ base, count: 0, out: new Map(), in: new Map(), aligned: new Set() });
    return id;
  };
  const link = (u, v) => {
    if (u == null || v == null || u === v) return;
    nodes[u].out.set(v, (nodes[u].out.get(v) || 0) + 1);
    nodes[v].in.set(u, (nodes[v].in.get(u) || 0) + 1);
  };

  const topoOrder = () => {
    const deg = nodes.map((n) => n.in.size);
    const q = [];
    for (let i = 0; i < nodes.length; i++) if (deg[i] === 0) q.push(i);
    const order = [];
    while (q.length) {
      const u = q.shift();
      order.push(u);
      for (const v of nodes[u].out.keys()) { deg[v] -= 1; if (deg[v] === 0) q.push(v); }
    }
    return order; // DAG by construction; partial order if a cycle ever sneaks in
  };

  // Reuse node `v` for an aligned base; if the base differs, find/create a
  // sibling in v's aligned ring so equal substitutions across reads merge.
  const nodeForAlignedBase = (v, base) => {
    if (nodes[v].base === base) return v;
    for (const sib of nodes[v].aligned) if (nodes[sib].base === base) return sib;
    const id = addNode(base);
    // join the mutual aligned ring (v + all its current siblings)
    const ring = new Set([v, ...nodes[v].aligned]);
    for (const r of ring) { nodes[r].aligned.add(id); nodes[id].aligned.add(r); }
    return id;
  };

  const addFirst = (seq) => {
    let prev = null;
    for (const b of seq) {
      const id = addNode(b);
      nodes[id].count += 1;
      link(prev, id);
      prev = id;
    }
  };

  // Align `seq` to the current graph (semiglobal on the graph) → ordered ops.
  const alignToGraph = (seq) => {
    const order = topoOrder();
    const T = order.length;
    const m = seq.length;
    const posOf = new Map();
    order.forEach((id, i) => posOf.set(id, i));
    // predecessors (topo indices) for each topo position; the virtual SOURCE
    // (free start anywhere) is an implicit predecessor of EVERY node.
    const preds = order.map((id) => [...nodes[id].in.keys()].map((u) => posOf.get(u)));

    const score = Array.from({ length: T }, () => new Float64Array(m + 1).fill(NEG));
    const bt = Array.from({ length: T }, () => new Array(m + 1).fill(null));
    const SRC = -1; // virtual source, score 0 at any j (free leading)

    for (let ti = 0; ti < T; ti++) {
      const base = nodes[order[ti]].base;
      const pp = preds[ti];
      const predScore = (jj) => {
        let best = 0; // SOURCE contributes 0 (free start)
        let from = SRC;
        for (const pt of pp) {
          const v = score[pt][jj];
          if (v > best) { best = v; from = pt; }
        }
        return { best, from };
      };
      for (let j = 0; j <= m; j++) {
        let best = NEG;
        let chosen = null;
        if (j > 0) {
          const { best: ps, from } = predScore(j - 1);
          const v = ps + (basesCompatible(base, seq[j - 1]) ? match : mismatch);
          if (v > best) { best = v; chosen = { op: 'M', pt: from, pj: j - 1 }; }
        }
        {
          const { best: ps, from } = predScore(j);
          const v = ps + gap; // delete graph node (gap in seq)
          if (v > best) { best = v; chosen = { op: 'D', pt: from, pj: j }; }
        }
        if (j > 0) {
          const v = score[ti][j - 1] + gap; // insert seq base (gap in graph)
          if (v > best) { best = v; chosen = { op: 'I', pt: ti, pj: j - 1 }; }
        }
        score[ti][j] = best;
        bt[ti][j] = chosen;
      }
    }

    // End semiglobal: best node having consumed all of seq (free trailing).
    let endTi = -1;
    let endBest = NEG;
    for (let ti = 0; ti < T; ti++) if (score[ti][m] > endBest) { endBest = score[ti][m]; endTi = ti; }

    const ops = [];
    let ti = endTi;
    let j = m;
    while (ti !== SRC && ti >= 0 && (j > 0 || true)) {
      const step = bt[ti][j];
      if (!step) break;
      if (step.op === 'M') ops.push({ type: 'M', nodeId: order[ti], j: step.pj });
      else if (step.op === 'D') ops.push({ type: 'D', nodeId: order[ti] });
      else ops.push({ type: 'I', j: step.pj });
      const nextTi = step.pt;
      j = step.pj;
      ti = nextTi;
      if (ti === SRC) break;
    }
    // any remaining leading seq bases are insertions before the graph
    for (let k = j - 1; k >= 0; k--) ops.push({ type: 'I', j: k });
    ops.reverse();
    return ops;
  };

  const incorporate = (ops, seq) => {
    let prev = null;
    for (const op of ops) {
      if (op.type === 'D') continue; // graph base skipped by this read
      let id;
      if (op.type === 'M') id = nodeForAlignedBase(op.nodeId, seq[op.j]);
      else id = addNode(seq[op.j]); // insertion → fresh node
      nodes[id].count += 1;
      link(prev, id);
      prev = id;
    }
  };

  for (const r of reads || []) {
    const seq = String(r || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!seq) continue;
    if (nodes.length === 0) addFirst(seq);
    else incorporate(alignToGraph(seq), seq);
  }

  // ── Heaviest-bundle consensus: the max summed-edge-weight path ────────────
  const order = topoOrder();
  const scoreTo = new Float64Array(nodes.length).fill(0);
  const back = new Array(nodes.length).fill(-1);
  for (const v of order) {
    let best = 0;
    let from = -1;
    let bestW = -1;
    for (const [u, w] of nodes[v].in) {
      const cand = scoreTo[u] + w;
      // Maximise summed edge weight; on a tie prefer the better-SUPPORTED edge
      // (higher weight) — never a longer path. A per-node bonus would reward
      // detours through inserted nodes, so it is deliberately absent.
      if (cand > best || (cand === best && w > bestW)) { best = cand; from = u; bestW = w; }
    }
    scoreTo[v] = best;
    back[v] = from;
  }
  let end = -1;
  let endBest = -1;
  for (let i = 0; i < nodes.length; i++) if (scoreTo[i] > endBest) { endBest = scoreTo[i]; end = i; }
  const path = [];
  for (let v = end; v !== -1; v = back[v]) path.push(v);
  path.reverse();
  const consensus = path.map((id) => nodes[id].base).join('');

  return { consensus, nodeCount: nodes.length, graph: { nodes } };
}
