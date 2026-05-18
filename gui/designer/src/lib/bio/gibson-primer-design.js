/**
 * gibson-primer-design — primer design helper для Gibson assembly.
 *
 * R7-1 (14.05.2026). Биолог собирает плазмиду из N фрагментов Gibson'ом.
 * Каждый fragment нужно PCR'нуть с праймерами, у которых 5'-tail =
 * homology arm соседнего fragment'а. Это helper генерит такие пары.
 *
 * Для each fragment i в circular assembly [F0..F_{n-1}]:
 *   - fwd[i] = 5'-tail(homology_to_F_{i-1}_3'_end) + anneal_at_F_i_5'_end
 *   - rev[i] = 5'-tail(homology_to_F_{i+1}_5'_end_revcomp) + anneal_at_F_i_3'_end_revcomp
 *
 * Для linear (left-to-right):
 *   - F_0: fwd без homology tail; rev с homology к F_1.
 *   - F_{n-1}: fwd с homology к F_{n-2}; rev без tail.
 *   - middle: оба с tails.
 */
import { calcTm } from '../../tm-calculator';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
function reverseComplement(s) {
  if (!s) return '';
  return s.toUpperCase().split('').reverse().map((c) => COMPLEMENT[c] || c).join('');
}

/**
 * pickBestAnneal — picks substring at fragment's 5' (forward) или 3'
 * (reverse) end с Tm closest to target. Length 18-26 nt.
 */
function pickBestAnneal(seq, anchor, opts = {}) {
  const minLen = opts.minLen ?? 18;
  const maxLen = opts.maxLen ?? 26;
  const targetTm = opts.targetTm ?? 58;
  let best = null;
  for (let n = minLen; n <= maxLen; n += 1) {
    if (n > seq.length) break;
    const sub = anchor === 'forward' ? seq.slice(0, n) : seq.slice(seq.length - n);
    const s = anchor === 'reverse' ? reverseComplement(sub) : sub;
    const tm = calcTm(s);
    const gc = ((s.toUpperCase().match(/[GC]/g) || []).length / s.length) * 100;
    const diff = Math.abs(tm - targetTm);
    if (!best || diff < best.diff) {
      best = {
        sequence: s,
        length: s.length,
        Tm: Math.round(tm * 10) / 10,
        GC: Math.round(gc * 10) / 10,
        diff,
      };
    }
  }
  return best;
}

/**
 * designGibsonPrimerPair — один primer pair для фрагмента fragment[i]
 * на основе соседних fragments в assembly.
 *
 * @param fragment       — current fragment {sequence, name}.
 * @param prevFragment   — соседний слева (или null для linear 5' end).
 * @param nextFragment   — соседний справа (или null для linear 3' end).
 * @param opts           — {homologyLen, annealMinLen, annealMaxLen, targetTm}.
 * @returns {{fwd: {sequence, length, Tm, GC, annealLen, homologyLen},
 *           rev: {...}}}
 */
export function designGibsonPrimerPair(fragment, prevFragment, nextFragment, opts = {}) {
  const homologyLen = opts.homologyLen ?? 20;
  const annealOpts = {
    minLen: opts.annealMinLen ?? 18,
    maxLen: opts.annealMaxLen ?? 26,
    targetTm: opts.targetTm ?? 58,
  };
  const seq = fragment.sequence || '';
  if (seq.length < annealOpts.minLen) {
    return { error: `Fragment ${fragment.name || fragment.id} too short for primer design` };
  }

  // FWD: homology tail (last homologyLen bp of prev fragment) + anneal at fragment's 5' end.
  let fwdHomology = '';
  if (prevFragment?.sequence) {
    const ps = prevFragment.sequence;
    fwdHomology = ps.slice(Math.max(0, ps.length - homologyLen));
  }
  const fwdAnneal = pickBestAnneal(seq, 'forward', annealOpts);
  const fwdSeq = (fwdHomology + fwdAnneal.sequence).toUpperCase();

  // REV: homology tail = revcomp of (first homologyLen bp of next fragment) + anneal at revcomp of fragment's 3' end.
  let revHomology = '';
  if (nextFragment?.sequence) {
    const ns = nextFragment.sequence;
    revHomology = reverseComplement(ns.slice(0, Math.min(homologyLen, ns.length)));
  }
  const revAnneal = pickBestAnneal(seq, 'reverse', annealOpts);
  const revSeq = (revHomology + revAnneal.sequence).toUpperCase();

  return {
    fwd: {
      sequence: fwdSeq,
      length: fwdSeq.length,
      Tm: fwdAnneal.Tm,
      GC: fwdAnneal.GC,
      annealLen: fwdAnneal.length,
      homologyLen: fwdHomology.length,
    },
    rev: {
      sequence: revSeq,
      length: revSeq.length,
      Tm: revAnneal.Tm,
      GC: revAnneal.GC,
      annealLen: revAnneal.length,
      homologyLen: revHomology.length,
    },
  };
}

/**
 * designGibsonPrimers — массив pair'ов для всех fragment'ов в assembly.
 *
 * @param fragments  — array fragment containers in assembly order.
 * @param circular   — true = wrap-around assembly (F_{n-1} → F_0).
 * @param opts       — see designGibsonPrimerPair opts.
 * @returns Array<{fragmentId, fragmentName, fwd, rev, error?}>.
 */
export function designGibsonPrimers(fragments, circular = true, opts = {}) {
  if (!Array.isArray(fragments) || fragments.length === 0) return [];
  const n = fragments.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const fragment = fragments[i];
    let prev = null;
    let next = null;
    if (i > 0) prev = fragments[i - 1];
    else if (circular && n > 1) prev = fragments[n - 1];
    if (i < n - 1) next = fragments[i + 1];
    else if (circular && n > 1) next = fragments[0];
    const result = designGibsonPrimerPair(fragment, prev, next, opts);
    out.push({
      fragmentId: fragment.id,
      fragmentName: fragment.name || fragment.id?.slice?.(0, 8),
      ...result,
    });
  }
  return out;
}
