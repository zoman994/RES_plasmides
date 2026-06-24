/**
 * introns-from-alignment — candidate introns from a cDNA/mRNA-vs-genomic
 * alignment. When a spliced transcript (cDNA / mRNA / exon sequence) is aligned
 * to its genomic reference, the runs of REFERENCE positions the read skips
 * (gapB / deletions) inside the aligned span are exactly the spliced-out
 * introns. Pure — returns reference-coordinate [start,end) intervals tagged
 * with their donor/acceptor dinucleotides so the UI can flag canonical GT…AG.
 */

function pushGap(out, start, end, seq, minGap) {
  if (end - start < minGap) return;
  const donor = seq.slice(start, start + 2);
  const acceptor = seq.slice(end - 2, end);
  out.push({ start, end, donor, acceptor, canonical: donor === 'GT' && acceptor === 'AG' });
}

/**
 * @param {{span:{start,end}, readByRefPos:Object}} alignToRef — from buildAlignToReference
 * @param {string} refSeq — the reference (genomic) sequence
 * @param {{minGap?:number}} [opts] — minimum gap length to call an intron (default 20)
 * @returns {Array<{start,end,donor,acceptor,canonical}>} ref-coordinate introns
 */
export function intronsFromAlignment(alignToRef, refSeq, opts = {}) {
  const minGap = opts.minGap ?? 20;
  const out = [];
  if (!alignToRef || !alignToRef.span) return out;
  const { span, readByRefPos } = alignToRef;
  if (!readByRefPos || !(span.end >= span.start)) return out;
  const seq = (refSeq || '').toUpperCase();
  let runStart = -1;
  for (let p = span.start; p <= span.end; p++) {
    const r = readByRefPos[p];
    const isGap = !!(r && r.status === 'gapB');
    if (isGap) {
      if (runStart < 0) runStart = p;
    } else if (runStart >= 0) {
      pushGap(out, runStart, p, seq, minGap); // gap run ends at the first covered base
      runStart = -1;
    }
  }
  if (runStart >= 0) pushGap(out, runStart, span.end + 1, seq, minGap);
  return out;
}
