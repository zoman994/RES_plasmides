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
  const left = endInfo(pairs[0].enzyme);
  const right = endInfo(pairs[1].enzyme);
  if (!left && !right) return null;
  return { left, right };
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
  // Concrete overhang must match exactly (palindromic → string-equal ⇔ complementary).
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

/** Short human label for an overhang end: «5′ AATT» / «3′ TGCA» / «тупой». */
export function overhangLabel(end) {
  if (!end) return '';
  if (end.type === 'blunt' || !end.seq) return 'тупой';
  const tick = end.type === '3prime' ? "3′" : "5′";
  return `${tick} ${end.seq}`;
}
