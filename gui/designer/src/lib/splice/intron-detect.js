/**
 * intron-detect.js — Phase 1 orchestrator. Runs the gene-model decoder on both
 * strands of a single gene-scale sequence, returns the better-scoring strand's
 * intron/exon structure as annotation-ready regions (0-based half-open, with
 * ids, per the annotation contract) plus a list of CRYPTIC splice sites
 * (high-scoring GT/AG NOT used in the model — the «unexpected splicing» warning
 * for expression-construct design). Pure, client-side.
 */
import { reverseComplement } from '../../sequence-utils';
import { makeId } from '../ids';
import { detectGeneStructure } from './gene-model';
import { pSite } from './splice-sites';

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * @param {string} seq  one gene (few kb).
 * @param {object} [opts]  forwarded to the decoder (minIntron/maxIntron/scoreGate/
 *   orfGuided/orfBonus) + crypticGate (default 6), emitExons (default true).
 * @returns {{strand:1|-1, introns:Array, exons:Array, cryptic:Array, orf:number,
 *            score:number, splicedSeq:string}}
 */
export function detectIntrons(seq, opts = {}) {
  const s = clean(seq);
  const n = s.length;
  if (n < 30) return { strand: 1, introns: [], exons: [], cryptic: [], orf: 0, score: 0, splicedSeq: s };

  const fwd = detectGeneStructure(s, opts);
  const rev = detectGeneStructure(reverseComplement(s), opts);
  const useRev = rev.score > fwd.score + 1e-9; // forward wins ties
  const chosen = useRev ? rev : fwd;
  const strand = useRev ? -1 : 1;
  // map a working-strand half-open interval [a,b) → forward coords
  const mapIv = useRev ? (a, b) => [n - b, n - a] : (a, b) => [a, b];

  const used = new Set();
  const introns = chosen.introns.map((it, k) => {
    used.add(`d${it.start}`);
    used.add(`a${it.end}`);
    const [start, end] = mapIv(it.start, it.end + 1); // inclusive [start..end] → half-open
    return { id: makeId(), type: 'intron', level: 'region', strand, start, end, name: `intron ${k + 1}`, score: r2(it.score) };
  }).sort((a, b) => a.start - b.start);

  const exons = [];
  if (opts.emitExons !== false) {
    const sorted = chosen.introns.slice().sort((a, b) => a.start - b.start);
    const segs = [];
    let cur = 0;
    for (const it of sorted) { if (it.start > cur) segs.push([cur, it.start]); cur = it.end + 1; }
    if (cur < n) segs.push([cur, n]);
    segs.forEach((seg, k) => {
      const [start, end] = mapIv(seg[0], seg[1]);
      exons.push({ id: makeId(), type: 'exon', level: 'region', strand, start, end, name: `exon ${k + 1}` });
    });
  }

  const crypticGate = opts.crypticGate ?? 6;
  const pOf = (x) => (x.prob != null ? x.prob : pSite(x.score)); // CNN supplies a real prob
  const cryptic = [];
  for (const d of chosen.donors) {
    if (d.score >= crypticGate && !used.has(`d${d.pos}`)) cryptic.push({ kind: 'donor', pos: mapIv(d.pos, d.pos + 1)[0], score: r2(d.score), p: r2(pOf(d)) });
  }
  for (const a of chosen.acceptors) {
    if (a.score >= crypticGate && !used.has(`a${a.pos}`)) cryptic.push({ kind: 'acceptor', pos: mapIv(a.pos, a.pos + 1)[0], score: r2(a.score), p: r2(pOf(a)) });
  }
  cryptic.sort((x, y) => y.score - x.score);

  return { strand, introns, exons, cryptic, orf: chosen.orf, score: r2(chosen.score), splicedSeq: chosen.splicedSeq };
}
