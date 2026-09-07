/**
 * digest-fragments — compute EVERY fragment a (possibly multi-site) restriction
 * digest produces, so the picker can show the «gel» and let the biolog choose
 * which band to extract (Игорь 21.06.2026: «если сайтов больше двух — модалка с
 * плазмидой, какие куски есть и какой выбрать… это рестрикция/гель/выделение»).
 *
 * The built-in `digest()` only resolves 1–2 cuts; this generalises to N cuts.
 *
 * Fragment boundaries use each canonical occurrence's physical top-strand cut;
 * the scanner already accounts for strand and circular wrapping. Fragments lie
 * between consecutive cuts:
 *   - circular: N cuts → N fragments (the last WRAPS the origin → it is taken as
 *     the multi-range [start..len] + [0..end] the assembly model now supports);
 *   - linear:   N cuts → N+1 fragments, the two outer ones keeping native ends.
 *
 * Pure. Uses the shared canonical occurrence scanner.
 */
import { effectiveEnzymes } from '../../../restriction-db';
import { restrictionBreakKey, scanOccurrences } from '../../../lib/restriction-occurrence';

export function digestFragments(sequence, enzymeNames, circular = true, reEnzymes = null) {
  const seq = String(sequence || '');
  const seqLen = seq.length;
  const enzymes = [...new Set((enzymeNames || []).filter(Boolean))];
  const catalog = reEnzymes || effectiveEnzymes();
  const cuts = scanOccurrences(seq, {
    circular: !!circular,
    enzymes: catalog,
    names: enzymes,
  })
    .filter((occurrence) => Number.isFinite(occurrence.topCut))
    .map((occurrence) => ({
      position: occurrence.topCut,
      enzyme: occurrence.enzyme,
      occurrence,
    }));
  cuts.sort((a, b) => a.position - b.position);
  // Collapse only identical double-strand breaks. The same top-strand bond with
  // a different bottom cut is conflicting chemistry, never an interchangeable
  // duplicate chosen by scan order.
  const uniq = [];
  for (const cut of cuts) {
    const previous = uniq[uniq.length - 1];
    if (!previous || previous.position !== cut.position) {
      uniq.push(cut);
      continue;
    }
    if (restrictionBreakKey(previous.occurrence) !== restrictionBreakKey(cut.occurrence)) {
      return {
        fragments: [], cuts: [], circular: !!circular, seqLen,
        error: `Conflicting cut geometry at ${cut.position}: ${previous.enzyme} and ${cut.enzyme}`,
      };
    }
  }
  if (uniq.length === 0) return { fragments: [], cuts: [], circular: !!circular, seqLen };

  const fragments = [];
  if (circular) {
    for (let i = 0; i < uniq.length; i += 1) {
      const a = uniq[i];
      const b = uniq[(i + 1) % uniq.length];
      const start = a.position;
      const end = b.position;
      const length = (((end - start) % seqLen) + seqLen) % seqLen || seqLen;
      fragments.push({
        index: i,
        start,
        end,
        length,
        wraps: end <= start, // crosses the origin → multi-range on selection
        leftEnzyme: a.enzyme,
        rightEnzyme: b.enzyme,
        leftCut: a,
        rightCut: b,
      });
    }
  } else {
    const bounds = [0, ...uniq.map((c) => c.position), seqLen];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      fragments.push({
        index: i,
        start: bounds[i],
        end: bounds[i + 1],
        length: bounds[i + 1] - bounds[i],
        wraps: false,
        leftEnzyme: i === 0 ? null : uniq[i - 1].enzyme,
        rightEnzyme: i === bounds.length - 2 ? null : uniq[i].enzyme,
        leftCut: i === 0 ? null : uniq[i - 1],
        rightCut: i === bounds.length - 2 ? null : uniq[i],
      });
    }
  }
  return {
    fragments, cuts: uniq, circular: !!circular, seqLen,
  };
}

/**
 * fragmentRanges — turn a fragment into the assembly piece range(s): a normal
 * [start,end] span, or — when it wraps the circular origin — the two valid
 * ranges [start..len] + [0..end] (the invariant forbids a single start>=end).
 */
export function fragmentRanges(fragment, seqLen, orientation = 'forward') {
  if (!fragment) return [];
  const { start, end } = fragment;
  if (fragment.wraps || end <= start) {
    const out = [];
    if (start < seqLen) out.push({ start, end: seqLen, orientation });
    if (end > 0) out.push({ start: 0, end, orientation });
    return out;
  }
  return [{ start, end, orientation }];
}
