/**
 * segment-overhangs — pure: for a restriction-acquired assembly segment, derive
 * the sticky-end overhang at each END (left = lower cut, right = higher cut).
 *
 * A RE-cut segment carries `acquisitionMethod:'restriction'` +
 * `acquisitionParams = { enzymes:[a,b], cutSites:[{position},{position}] }`
 * (V157). The cut sites identify WHICH enzyme cut each end (sort by position);
 * the overhang itself comes from the enzyme: delta = cut[1]-cut[0] (>0 = 5′,
 * <0 = 3′, 0 = blunt), and `enzyme.overhang` is the single-strand sequence.
 *
 * @returns null for non-restriction segments, else
 *   { left: {enzyme,delta,type,seq}|null, right: {…}|null }
 */
import { reverseComplement } from '../../../sequence-utils';

export function segmentOverhangs(segment, reEnzymes) {
  if (!segment || segment.acquisitionMethod !== 'restriction') return null;
  const ap = segment.acquisitionParams || {};
  const enzymes = Array.isArray(ap.enzymes) ? ap.enzymes : [];
  const cutSites = Array.isArray(ap.cutSites) ? ap.cutSites : [];
  const endInfo = (enzName) => {
    const e = reEnzymes && reEnzymes[enzName];
    if (!e || !Array.isArray(e.cut) || e.cut.length < 2) return null;
    const delta = e.cut[1] - e.cut[0];
    const type = e.end || (delta > 0 ? '5prime' : delta < 0 ? '3prime' : 'blunt');
    const seq = e.overhang || '';
    return { enzyme: enzName, delta, type, seq, label: overhangLabel({ type, seq }) };
  };
  // #4 (single-cut linearize) — one enzyme cut once → BOTH ends carry that
  // enzyme's overhang (the linearized plasmid's two compatible ends).
  if ((ap.single || (enzymes.length === 1 && cutSites.length === 1)) && enzymes[0]) {
    const info = endInfo(enzymes[0]);
    return info ? { left: info, right: info } : null;
  }
  if (enzymes.length < 2 || cutSites.length < 2) return null;
  const pairs = [
    { enzyme: enzymes[0], pos: cutSites[0] && cutSites[0].position },
    { enzyme: enzymes[1], pos: cutSites[1] && cutSites[1].position },
  ].filter((p) => Number.isFinite(p.pos));
  if (pairs.length < 2) return null;
  pairs.sort((a, b) => a.pos - b.pos);
  const lowEnd = endInfo(pairs[0].enzyme); // lower source position
  const highEnd = endInfo(pairs[1].enzyme); // higher source position
  if (!lowEnd && !highEnd) return null;
  // RC-ORIENT (Игорь 25.06) — a fragment placed REVERSED (segment.reverseComplement)
  // has its physical ends swapped: the lower-source-position cut is now its RIGHT end
  // and the higher its LEFT end. Classical Type II overhangs are palindromic
  // (self-complementary), so each end's seq + polarity are invariant under
  // reverse-complement — only WHICH end is left/right flips (consistent with
  // junctionInterlock, which compares overhang seq-equality as a complementarity
  // proxy that only holds for palindromic overhangs). Without this swap a reversed
  // fragment with DIFFERENT enzymes at its two ends reports its ends backwards, so
  // junctionInterlock / the seam / the closure gate / readiness compare the WRONG end
  // → a silently false compatibility verdict (the user can't see which way to place it).
  return segment.reverseComplement
    ? { left: highEnd, right: lowEnd }
    : { left: lowEnd, right: highEnd };
}

/**
 * terminalStagger — render geometry for the PHYSICAL sticky-end staircase at a
 * fragment's termini (Игорь 22.06: «физическая ступенька»; «липкий конец потом
 * для визуализации [шва] годен, гейту поможет»). Consumes the SAME segmentOverhangs
 * model that junctionInterlock (the compatibility gate) + the V160 seam use, so the
 * staircase, the seam and the gate can never disagree. Pure; null when blunt /
 * non-restriction.
 *
 * Per end — which strand PROTRUDES (single-stranded overhang) vs is RECESSED:
 *   • 5′ overhang → LEFT terminus: top protrudes;   RIGHT terminus: bottom protrudes.
 *   • 3′ overhang → LEFT terminus: bottom protrudes; RIGHT terminus: top protrudes.
 * (Same polarity convention as junctionInterlock's topOwner/botOwner.)
 *
 * @returns {{left:object|null, right:object|null}|null} each end:
 *   { end, type, seq, len, protruding:'top'|'bottom', recessed, label }
 */
export function terminalStagger(segment, reEnzymes) {
  const oh = segmentOverhangs(segment, reEnzymes);
  if (!oh) return null;
  const forEnd = (end, ov) => {
    if (!ov || ov.type === 'blunt' || !ov.seq) return null;
    const five = ov.type === '5prime';
    const protruding = end === 'left'
      ? (five ? 'top' : 'bottom')
      : (five ? 'bottom' : 'top');
    return {
      end,
      type: ov.type,
      seq: ov.seq,
      len: Math.abs(ov.delta) || ov.seq.length,
      protruding,
      recessed: protruding === 'top' ? 'bottom' : 'top',
      label: ov.label,
    };
  };
  const left = forEnd('left', oh.left);
  const right = forEnd('right', oh.right);
  if (!left && !right) return null;
  return { left, right };
}

/**
 * stickyEndExtent — V159. For an RE-pair selection whose ends sit on the two
 * top-strand cuts [start,end], return the FULL duplex extent that ALSO covers
 * the single-stranded overhang nucleotides on whichever strand PROTRUDES past
 * a cut:
 *   • a 5′ overhang at the RIGHT end protrudes on the bottom strand PAST `end`
 *     → extend `end` outward by the overhang length;
 *   • a 3′ overhang at the LEFT end protrudes on the bottom strand BEFORE
 *     `start` → extend `start` outward.
 * A 5′-left / 3′-right overhang protrudes on the strand already inside
 * [start,end], so it needs no extension. Clamped to [0, seqLen].
 *
 * This is for the picker's out-of-range MASK ONLY — so the overhang reads as
 * part of the fragment's sticky end instead of being dimmed («в тени»). The
 * STORED fragment range stays at the top cuts: that convention is what lets
 * adjacent RE fragments concatenate with each SHARED overhang counted exactly
 * once (a 5′ right overhang is owned by the next fragment, whose top strand
 * starts at the same cut). Extending the stored slice would duplicate the
 * overhang at every ligation junction and corrupt the reconstituted RE site.
 *
 * @returns { start, end } — unchanged [lo,hi] when params missing / both blunt.
 */
export function stickyEndExtent({ start, end, acquisitionParams, reEnzymes, seqLen } = {}) {
  const a = Number.isFinite(start) ? start : 0;
  const b = Number.isFinite(end) ? end : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const oh = segmentOverhangs(
    { acquisitionMethod: 'restriction', acquisitionParams },
    reEnzymes,
  );
  if (!oh) return { start: lo, end: hi };
  const leftDelta = oh.left ? oh.left.delta : 0;
  const rightDelta = oh.right ? oh.right.delta : 0;
  let s = lo + Math.min(0, leftDelta);
  let e = hi + Math.max(0, rightDelta);
  s = Math.max(0, s);
  if (Number.isFinite(seqLen)) e = Math.min(seqLen, e);
  return { start: s, end: e };
}

/**
 * junctionInterlock — V160. Given the LEFT segment's RIGHT overhang and the
 * RIGHT segment's LEFT overhang (each {enzyme,delta,type,seq,label}|null),
 * decide whether the two cohesive ends MATE at the seam and describe the
 * interlock geometry for rendering.
 *
 * Compatibility rule (project canon, restriction-db.js getCompatible): two ends
 * mate ⟺ same overhang `seq` AND same polarity `type`; blunt+blunt always mate.
 * Because RE overhangs are stored palindrome-folded 5′→3′, string-equality IS
 * reverse-complementarity for the classical RE set (5′ AATT == its own RC).
 *
 * Geometry (for a COMPATIBLE sticky junction at boundary column `p`): the two
 * overhangs occupy the SAME `length` columns on OPPOSITE strands — that is the
 * visible "step down + step up = flush" interlock. `side` says which side of `p`
 * the overhang zone lies on; `topOwner`/`botOwner` say which fragment's colour
 * the top/bottom strand bar takes ('this' = left segment, 'next' = right):
 *   • 5′ → zone AFTER p `[p, p+len]`; A's bottom protrudes (botOwner 'this'),
 *     B's top protrudes (topOwner 'next');
 *   • 3′ → zone BEFORE p `[p-len, p]`; A's top protrudes (topOwner 'this'),
 *     B's bottom protrudes (botOwner 'next').
 *
 * @returns {{ verdict:'compatible'|'incompatible'|'blunt'|'unknown',
 *   length:number, message:string, overhang:string,
 *   side:'afterP'|'beforeP'|null, topOwner:'this'|'next'|null, botOwner:'this'|'next'|null }}
 */
export function junctionInterlock(aRight, bLeft) {
  const none = {
    verdict: 'unknown', length: 0, message: '', overhang: '',
    side: null, topOwner: null, botOwner: null,
  };
  if (!aRight || !bLeft) return none;
  const aBlunt = aRight.type === 'blunt';
  const bBlunt = bLeft.type === 'blunt';
  if (aBlunt && bBlunt) {
    return {
      ...none, verdict: 'blunt',
      message: 'Тупые концы — стыкуются в любой ориентации',
    };
  }
  // Polarity / blunt-vs-sticky mismatch → clearly cannot mate.
  if (aBlunt !== bBlunt || aRight.type !== bLeft.type) {
    return {
      ...none, verdict: 'incompatible',
      length: Math.max(Math.abs(aRight.delta || 0), Math.abs(bLeft.delta || 0)),
      message: `Несовместимые липкие концы: ${aRight.label || '?'} ≠ ${bLeft.label || '?'}`,
    };
  }
  // RC-BIO-4 — a degenerate/interrupted-site cutter stores an IUPAC-ambiguous overhang
  // (StyI 'CWWG', SfiI 'NNN'); two such overhangs can be string-equal yet carry
  // DIFFERENT concrete bases at their cuts that do NOT anneal. We can't decide from the
  // literal string → 'unknown' (manual check), never a false 'compatible'.
  const degenerate = (s) => /[^ACGT]/i.test(s || '');
  if (degenerate(aRight.seq) || degenerate(bLeft.seq)) {
    return {
      ...none, verdict: 'unknown', overhang: aRight.seq || bLeft.seq || '',
      message: `Вырожденный сайт (${aRight.label || aRight.seq || '?'}) — совместимость не проверяется автоматически`,
    };
  }
  // RC-BIO-5 (V170, audit) — the string-equality proxy below is REVERSE-COMPLEMENTARITY
  // only for PALINDROMIC overhangs (the classical RE set: AATT == RC(AATT)). ~6 commercial
  // cutters leave NON-palindromic overhangs (BauI 5′ ACGA, BseYI 5′ CCAG, BbvCI, GsaI,
  // Bst2BI). Two identical non-palindromic overhangs do NOT anneal (5′ ACGA needs 5′ TCGT),
  // and the model stores ONE overhang per enzyme (no upstream/downstream half distinction),
  // so we genuinely cannot decide → 'unknown' (manual check), never a silent false verdict.
  const palindromic = (s) => { const u = String(s || '').toUpperCase(); return !!u && u === reverseComplement(u); };
  if (!palindromic(aRight.seq) || !palindromic(bLeft.seq)) {
    return {
      ...none, verdict: 'unknown', overhang: aRight.seq || bLeft.seq || '',
      message: `Непалиндромный липкий конец (${aRight.label || aRight.seq || '?'}) — совместимость не проверяется автоматически`,
    };
  }
  // Concrete PALINDROMIC overhang must match exactly (string-equal ⇔ complementary).
  if (aRight.seq !== bLeft.seq) {
    return {
      ...none, verdict: 'incompatible',
      length: Math.max(Math.abs(aRight.delta || 0), Math.abs(bLeft.delta || 0)),
      message: `Несовместимые липкие концы: ${aRight.label || '?'} ≠ ${bLeft.label || '?'}`,
    };
  }
  const fivePrime = aRight.type === '5prime'; // delta > 0
  return {
    verdict: 'compatible',
    length: Math.abs(aRight.delta || 0),
    message: `Совместимы: ${aRight.label || aRight.seq}`,
    overhang: aRight.seq || '',
    side: fivePrime ? 'afterP' : 'beforeP',
    topOwner: fivePrime ? 'next' : 'this',
    botOwner: fivePrime ? 'this' : 'next',
  };
}

/**
 * orientFragments — Ф4.1 (Игорь 27.06 «где переворот фрагмента?»). Assign each
 * fragment an orientation (forward / reverse-complement) so that adjacent sticky
 * ends mate COMPLEMENTARILY. SINGLE source of truth: the same `reversed[]` drives
 * the card's rc render, the precise end interlock, AND the closure gate — so «the
 * green seam» and «the product assembles» can never disagree again.
 *
 * Greedy: seg0 is the anchor (forward); each next fragment picks forward/rc so its
 * LEFT end mates the previous fragment's (already-oriented) RIGHT end. For a ring,
 * the last RIGHT must also mate the first LEFT (`closes`).
 *
 * @returns {{
 *   orientations: Array<{index:number, reversed:boolean}>,
 *   junctions: Array<{from:number, to:number, mates:boolean, closure?:boolean}>,
 *   chainMates: boolean,   // every INTERNAL junction mates
 *   closes: boolean,       // circular: chainMates AND the closure seam mates
 * }}
 */
export function orientFragments(segments, reEnzymes, opts = {}) {
  const list = Array.isArray(segments) ? segments : [];
  const n = list.length;
  const circular = !!opts.circular;
  if (n === 0) {
    return {
      orientations: [], junctions: [], chainMates: false, closes: false,
    };
  }
  // Overhangs in BOTH orientations (segmentOverhangs swaps ends on reverseComplement).
  const ohFwd = list.map((s) => segmentOverhangs({ ...s, reverseComplement: false }, reEnzymes));
  const ohRev = list.map((s) => segmentOverhangs({ ...s, reverseComplement: true }, reEnzymes));
  const endsFor = (i, rev) => (rev ? ohRev[i] : ohFwd[i]) || { left: null, right: null };
  const lock = (aRight, bLeft) => junctionInterlock(aRight, bLeft);
  const mate = (aRight, bLeft) => {
    const v = lock(aRight, bLeft).verdict;
    return v === 'compatible' || v === 'blunt';
  };
  // Junction descriptor enriched with the overhang seq/len so the meshed seam (Ф4.3)
  // can draw the actual interlocking bases without re-deriving overhangs.
  const descAt = (i, j) => {
    const aR = endsFor(i, reversed[i]).right;
    const bL = endsFor(j, reversed[j]).left;
    const il = lock(aR, bL);
    return {
      mates: il.verdict === 'compatible' || il.verdict === 'blunt',
      overhang: il.overhang || '',
      len: il.length || 0,
      blunt: il.verdict === 'blunt',
      enzyme: (aR && aR.enzyme) || (bL && bL.enzyme) || '',
    };
  };

  // Orientation solver (V172 / GAP-5). The old GREEDY assignment anchored seg0 at its
  // stored orientation and oriented each next fragment to mate the previous — which
  // MISSES a closable N≥3 ring whose only valid orientation needs seg0 flipped (e.g.
  // f0=AATT|GATC, f1=AATT|AGCT, f2=AGCT|GATC closes ONLY with f0 reversed). Replace it
  // with BACKTRACKING, STORED-orientation-first, so an already-valid layout is preserved
  // (no gratuitous flips — an intentional inversion that mates is kept) while seg0 is now
  // a free variable the search can flip. Provably sufficient for the palindromic end
  // model (for i≥1 only one orientation mates the previous unless the fragment's two ends
  // are equal, where a flip is a no-op — seg0 is the only variable greedy mis-anchored).
  const storedRev = list.map((s) => !!(s && s.reverseComplement));

  // Greedy fallback — reproduces the prior assignment EXACTLY, used when no full mating
  // solution exists (genuinely unclosable / mixed un-matable ends) so linear / partial /
  // unclosable behaviour is byte-for-byte unchanged.
  const greedyAssign = () => {
    const g = new Array(n).fill(false);
    g[0] = storedRev[0];
    for (let i = 1; i < n; i += 1) {
      const prevRight = endsFor(i - 1, g[i - 1]).right;
      if (mate(prevRight, endsFor(i, storedRev[i]).left)) g[i] = storedRev[i];
      else if (mate(prevRight, endsFor(i, !storedRev[i]).left)) g[i] = !storedRev[i];
      else g[i] = storedRev[i];
    }
    return g;
  };

  // Pruned DFS — each internal junction must mate to recurse (so branching is ~1 in
  // practice; the only real fork is seg0). Cap pathological N to keep the per-keystroke
  // draft cheap; large assemblies fall back to greedy.
  let solution = null;
  if (n <= 16) {
    const work = new Array(n).fill(false);
    const dfs = (i) => {
      if (solution) return;
      if (i === n) {
        if (!circular) { solution = work.slice(); return; }
        // ring closes when the last RIGHT mates the first LEFT (n===1: its own two ends).
        if (mate(endsFor(n - 1, work[n - 1]).right, endsFor(0, work[0]).left)) {
          solution = work.slice();
        }
        return;
      }
      for (const tryRev of [storedRev[i], !storedRev[i]]) { // stored first
        if (i > 0 && !mate(endsFor(i - 1, work[i - 1]).right, endsFor(i, tryRev).left)) continue;
        work[i] = tryRev;
        dfs(i + 1);
        if (solution) return;
      }
    };
    dfs(0);
  }

  const reversed = solution || greedyAssign();

  const junctions = [];
  let chainMates = true;
  for (let i = 0; i < n - 1; i += 1) {
    const d = descAt(i, i + 1);
    if (!d.mates) chainMates = false;
    junctions.push({ from: i, to: i + 1, ...d });
  }

  let closes = false;
  if (circular) {
    const d = descAt(n - 1, 0);
    junctions.push({
      from: n - 1, to: 0, ...d, closure: true,
    });
    closes = chainMates && d.mates;
  }

  return {
    orientations: reversed.map((r, i) => ({ index: i, reversed: r })),
    junctions,
    chainMates,
    closes,
  };
}

/**
 * reflectAnnotations — Ф4.2. Mirror a fragment's OWN annotations under reverse-
 * complement (0-based, end-exclusive, ⚓ DEC-ANN-10): [s,e) → [len-e, len-s),
 * strand flips. Same coordinate math as collectAssemblyAnnotations' rc branch,
 * but relative to the fragment's own length (not the assembly). Pure; ids kept.
 */
export function reflectAnnotations(annotations, len) {
  const L = Number(len) || 0;
  if (!Array.isArray(annotations) || L === 0) {
    return Array.isArray(annotations) ? annotations : [];
  }
  return annotations.map((a) => {
    const s = Number(a.start);
    const e = Number(a.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return a;
    // Segment annotations are 1-based inclusive (same contract as
    // transferAnnotations) — the RC of [s,e] on a length-L molecule is
    // [L-e+1, L-s+1], NOT [L-e, L-s] (that 0-based formula shifted every
    // reversed-fragment feature 1 bp; Игорь 29.06 RE-cloning audit).
    return {
      ...a, start: L - e + 1, end: L - s + 1, strand: -(Number(a.strand) || 1),
    };
  });
}

/**
 * reverseComplementSegment — V184. Flip a restriction-cut segment's TOP STRAND
 * with OVERHANG AWARENESS so a fragment placed REVERSED still reconstitutes its
 * sticky-end RE site at the seam (Игорь 29.06: «после лигирования не обнаруживается
 * сайт ApaI … он на обратной цепи теперь»).
 *
 * The model stores a segment as the top-strand slice between the two TOP cuts, so
 * FORWARD concatenation re-forms each shared overhang exactly once (see
 * stickyEndExtent). A plain reverseComplement(topSlice) does NOT restore that
 * stagger: the flipped fragment's physical ends land at the BOTTOM cuts, shifted by
 * the overhang on each side, so the seam stops spelling the recognition site.
 *
 * The flipped top strand IS the segment's bottom strand read 5′→3′, i.e.
 * RC(source[a+δL : b+δR]) where a,b are the stored top cuts and δ = cut[1]-cut[0]
 * (δ<0 → 3′ overhang, bottom cut LEFT of top cut; δ>0 → 5′; 0 → blunt). Expressed
 * from the stored top slice T (= source[a:b]) plus the palindromic overhang bases:
 *   δ<0 at LEFT  → prepend |δL| overhang bases (they sit left of `a`, outside T);
 *   δ>0 at RIGHT → append δR overhang bases (right of `b`, outside T);
 *   δ>0 at LEFT  → drop the first δL bases of T; δ<0 at RIGHT → drop the last |δR|.
 * The reconstructed bases come from enzyme.overhang and are valid only when the
 * overhang is palindromic (== its own RC). A non-palindromic / unknown end can't be
 * rebuilt from one stored overhang → fall back to a plain RC (those ends never mate,
 * junctionInterlock → 'unknown', so they never sit in a closed assembly anyway).
 *
 * Pure. @param segment a segment {sequence, acquisitionMethod, acquisitionParams,
 *   reverseComplement} in its CURRENT orientation; @returns the flipped top strand.
 */
export function reverseComplementSegment(segment, reEnzymes) {
  const T = (segment && typeof segment.sequence === 'string') ? segment.sequence : '';
  const oh = segmentOverhangs(segment, reEnzymes);
  if (!oh || !T) return reverseComplement(T);
  const palindromic = (s) => { const u = String(s || '').toUpperCase(); return !!u && u === reverseComplement(u); };
  // A sticky end we cannot safely reconstruct (non-palindromic overhang) → bail out
  // to the plain RC. Blunt / native (null) ends need no reconstruction.
  const unsafe = (end) => !!end && end.type !== 'blunt' && !!end.seq && !palindromic(end.seq);
  if (unsafe(oh.left) || unsafe(oh.right)) return reverseComplement(T);
  const dL = oh.left ? (Number(oh.left.delta) || 0) : 0;
  const dR = oh.right ? (Number(oh.right.delta) || 0) : 0;
  const len = T.length;
  const mid = T.slice(Math.max(0, dL), len + Math.min(0, dR));
  const leftExtra = (dL < 0 && oh.left) ? (oh.left.seq || '') : '';
  const rightExtra = (dR > 0 && oh.right) ? (oh.right.seq || '') : '';
  return reverseComplement(leftExtra + mid + rightExtra);
}

/** Short human label for an overhang end: «5′ AATT» / «3′ TGCA» / «тупой». */
export function overhangLabel(end) {
  if (!end) return '';
  if (end.type === 'blunt' || !end.seq) return 'тупой';
  const tick = end.type === '3prime' ? "3′" : "5′";
  return `${tick} ${end.seq}`;
}
