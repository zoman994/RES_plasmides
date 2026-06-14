/**
 * adapters/golden-gate.js — executeGoldenGate (Type IIS, 4-nt overhang).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): trim recognition site + 4-nt sticky overhangs.
 */
import { GG_ENZYMES, checkInternalSites, reverseComplement } from '../../../../../golden-gate';
import {
  newContainer,
  concatWithOverlapTrim,
  mergeAnnotationsForConcat,
} from './_shared';

// GG-1 — an INTERIOR Type IIS recognition site (not at a fragment end) makes the
// enzyme cut the fragment internally → no clean overhang. Sites AT the ends are
// the intended cloning sites (added as primer tails, trimmed during assembly), so
// they are fine. Returns the first fragment with an interior site, else null.
function fragmentWithInteriorSite(fragments, recognition) {
  const rec = (recognition || '').toUpperCase();
  if (!rec) return null;
  const recRC = reverseComplement(rec);
  for (const f of fragments) {
    const s = (f.sequence || '').toUpperCase();
    for (const pat of [rec, recRC]) {
      let i = s.indexOf(pat);
      while (i !== -1) {
        if (i !== 0 && i !== s.length - pat.length) return f; // strictly interior
        i = s.indexOf(pat, i + 1);
      }
    }
  }
  return null;
}

export function executeGoldenGate(operation, ctx) {
  const fragmentIds = operation.params?.fragmentIds || operation.inputs || [];
  const enzyme = operation.params?.enzyme || 'BsaI';
  const circular = operation.params?.circular !== false;
  if (fragmentIds.length < 2) return { error: 'Нужно ≥2 фрагментов' };

  const fragments = fragmentIds.map((id) => ctx.containers[id]).filter(Boolean);
  if (fragments.length !== fragmentIds.length) {
    return { error: 'Один или несколько фрагментов не найдены' };
  }

  const enzInfo = GG_ENZYMES[enzyme];
  // GG-1 — block a fragment with an INTERIOR recognition site (edge sites are the
  // intended, trimmed cloning sites). Suggest a clean alternative enzyme.
  const badFrag = fragmentWithInteriorSite(fragments, enzInfo?.recognition);
  if (badFrag) {
    const altList = checkInternalSites(fragments, enzyme).alternatives || [];
    const alt = altList.length ? ` — попробуйте ${altList[0]}` : '';
    return { error: `${enzyme} сайт внутри фрагмента ${badFrag.name || ''}${alt}`.trim() };
  }
  const recog = (enzInfo?.recognition || '').toUpperCase();
  let recogTrimmed = 0;
  const trim = (s, isFirst, isLast) => {
    if (!s || !recog) return s;
    let r = s;
    const ru = r.toUpperCase();
    if (!isFirst && ru.startsWith(recog)) {
      r = r.slice(recog.length);
      recogTrimmed += recog.length;
    }
    if (!isLast && r.toUpperCase().endsWith(recog)) {
      r = r.slice(0, r.length - recog.length);
      recogTrimmed += recog.length;
    }
    return r;
  };
  const trimmedSeqs = fragments.map((f, i) => trim(
    f.sequence,
    i === 0 && !circular,
    i === fragments.length - 1 && !circular,
  ));
  const { seq: concat, overlaps } = concatWithOverlapTrim(trimmedSeqs, circular);

  // R5-3: annotation merge с recog trimming shift.
  const trimmedFragments = fragments.map((f, i) => {
    const isFirst = i === 0 && !circular;
    const isLast = i === fragments.length - 1 && !circular;
    let leftTrim = 0;
    if (!isFirst && (f.sequence || '').toUpperCase().startsWith(recog)) {
      leftTrim = recog.length;
    }
    let rightTrim = 0;
    if (!isLast && (f.sequence || '').toUpperCase().endsWith(recog)) {
      rightTrim = recog.length;
    }
    const newLen = (f.sequence || '').length - leftTrim - rightTrim;
    const shiftedAnns = (Array.isArray(f.annotations) ? f.annotations : [])
      .filter((a) => typeof a?.start === 'number' && typeof a?.end === 'number')
      .map((a) => ({ ...a, start: a.start - leftTrim, end: a.end - leftTrim }))
      .filter((a) => a.start >= 0 && a.end <= newLen && a.end > a.start);
    return { ...f, sequence: trimmedSeqs[i], annotations: shiftedAnns };
  });
  const mergedAnns = mergeAnnotationsForConcat(trimmedFragments, overlaps);
  const parentNames = fragments.map((f) => f.name || 'frag').join('+');

  const assembly = newContainer({
    name: parentNames.length < 60 ? `${parentNames}_gg_${enzyme}` : `gg_${enzyme}_assembly`,
    sequence: concat,
    circular,
    annotations: mergedAnns,
    origin: {
      kind: 'op_golden_gate',
      operationId: operation.id,
      enzyme,
      method: 'goldengate',
      inputIds: fragmentIds,
      overlaps,
      recogTrimmed,
    },
  });
  return { outputs: [assembly] };
}
