/**
 * seam-staircase — pure geometry for the «настоящая ступенька» (Игорь 26.06
 * «просто буквы убрать»): at an INCOMPATIBLE restriction junction the recessed
 * strand under a sticky-end overhang must be rendered EMPTY (a real single-
 * stranded staircase, like a terminal overhang) — NOT a coloured box over the
 * letters. This helper says WHICH columns on WHICH strand to BLANK (replace the
 * base with a space) so the overhang reads as physically single-stranded while
 * the zone band tint stays.
 *
 * Pure (positions only, no DOM). Fed `coloredZones` (each carries `interlock`
 * + `reOverhangs` precomputed upstream in AssemblyShellBody) + the ring
 * `closureSeam`. Mirrors the biology used by junctionInterlock / segmentOverhangs.
 *
 * Geometry (0-based, end-exclusive product coords):
 *  - a fragment's RIGHT end overhang sits in its LAST `len` columns [pEnd-len, pEnd);
 *    a 5′ overhang protrudes the BOTTOM strand (top recessed) → blank TOP;
 *    a 3′ overhang protrudes the TOP strand (bottom recessed) → blank BOTTOM.
 *  - a fragment's LEFT end overhang sits in its FIRST `len` columns [pStart, pStart+len);
 *    a 5′ overhang protrudes the TOP strand (bottom recessed) → blank BOTTOM;
 *    a 3′ overhang protrudes the BOTTOM strand (top recessed) → blank TOP.
 */

function lenOf(e) {
  return Math.abs(e.delta) || (e.seq ? e.seq.length : 0);
}
const sticky = (e) => !!(e && e.type !== 'blunt' && e.seq);

// A fragment's RIGHT end (its 3′/5′ overhang at column pEnd). Recessed strand blanked
// over the fragment's last `len` columns.
function rightEndBlank(e, pEnd) {
  if (!sticky(e)) return null;
  const len = lenOf(e);
  if (len <= 0) return null;
  return { pos0: pEnd - len, pos1: pEnd, strand: e.type === '5prime' ? 'top' : 'bottom' };
}
// A fragment's LEFT end (overhang at column pStart). Recessed strand blanked over the
// fragment's first `len` columns.
function leftEndBlank(e, pStart) {
  if (!sticky(e)) return null;
  const len = lenOf(e);
  if (len <= 0) return null;
  return { pos0: pStart, pos1: pStart + len, strand: e.type === '5prime' ? 'bottom' : 'top' };
}

/**
 * @param {Array<{start,end,interlock,reOverhangs}>} zones
 * @param {{interlock,selfClosure}|null} closureSeam
 * @returns {Array<{pos0:number,pos1:number,strand:'top'|'bottom'}>}
 */
export function computeSeamRecessBlanks(zones, closureSeam) {
  const arr = Array.isArray(zones) ? zones : [];
  const out = [];
  const push = (b) => { if (b && b.pos1 > b.pos0) out.push(b); };

  // Internal seams: each incompatible boundary blanks the recessed strand of WHICHEVER
  // side carries a sticky overhang (the blunt side returns null).
  for (let i = 0; i < arr.length; i += 1) {
    const il = arr[i] && arr[i].interlock;
    if (!il || il.verdict !== 'incompatible') continue;
    const p = Math.max(0, arr[i].end);
    const ro = arr[i].reOverhangs;
    push(rightEndBlank(ro && ro.right, p));
    const nxt = arr[i + 1];
    const nro = nxt && nxt.reOverhangs;
    push(leftEndBlank(nro && nro.left, nxt ? Math.max(0, nxt.start) : p));
  }

  // Ring closure: the joining of the construct's start (first.left) and end (last.right).
  if (closureSeam && closureSeam.interlock && closureSeam.interlock.verdict === 'incompatible' && arr.length) {
    let minStart = Infinity;
    for (const z of arr) { const s = Math.max(0, z.start); if (s < minStart) minStart = s; }
    const first = arr.find((z) => Math.max(0, z.start) === minStart) || arr[0];
    const last = arr[arr.length - 1];
    push(leftEndBlank(first && first.reOverhangs && first.reOverhangs.left, first ? Math.max(0, first.start) : 0));
    push(rightEndBlank(last && last.reOverhangs && last.reOverhangs.right, last ? Math.max(0, last.end) : 0));
  }

  return out;
}

/**
 * True when (absolutePos, strand) falls inside any blank range — i.e. that base
 * should render as a blank (space). Used by StrandsTrack per character.
 */
export function isBlanked(blankRanges, absPos, strand) {
  if (!Array.isArray(blankRanges) || !blankRanges.length) return false;
  for (const b of blankRanges) {
    if (b.strand === strand && absPos >= b.pos0 && absPos < b.pos1) return true;
  }
  return false;
}
