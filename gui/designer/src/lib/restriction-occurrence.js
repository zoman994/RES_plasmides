/**
 * Canonical classical Type II restriction occurrence.
 *
 * Coordinates are 0-based. Recognition ranges are end-exclusive; topCut and
 * bottomCut are interbase positions. The caller owns the enzyme catalog so this
 * pure module never imports either RE_ENZYMES or GG_ENZYMES.
 */
import { reverseComplementIupac } from './iupac';

const IUPAC_PATTERN = Object.freeze({
  A: 'A', C: 'C', G: 'G', T: 'T',
  R: '[AG]', Y: '[CT]', M: '[AC]', K: '[GT]',
  S: '[GC]', W: '[AT]', H: '[ACT]', B: '[CGT]',
  V: '[ACG]', D: '[AGT]', N: '[ACGT]',
});

const patternCache = new Map();

function regexSource(site) {
  const normalized = String(site || '').toUpperCase();
  if (!normalized || !/^[ACGTRYMKSWHBVDN]+$/.test(normalized)) return null;
  if (!patternCache.has(normalized)) {
    patternCache.set(normalized, normalized.split('').map((base) => IUPAC_PATTERN[base]).join(''));
  }
  return patternCache.get(normalized);
}

/** Compatibility export: a fresh global RegExp, backed by the cached source. */
export function siteToRegex(site) {
  const source = regexSource(site);
  return new RegExp(source || '(?!)', 'gi');
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function recognitionGeometry(start, siteLength, sequenceLength, circular) {
  const end = start + siteLength;
  const wrapsOrigin = circular && end > sequenceLength;
  if (!wrapsOrigin) {
    return {
      start,
      end,
      segments: [{ start, end }],
      wrapsOrigin: false,
    };
  }
  return {
    start,
    end,
    segments: [{ start, end: sequenceLength }, { start: 0, end: end - sequenceLength }],
    wrapsOrigin: true,
  };
}

function occurrenceFromMatch({
  enzyme, info, strand, start, matchedSequence, sequenceLength, circular,
}) {
  const siteLength = info.site.length;
  const sourceTopOffset = strand === 1 ? info.cut[0] : siteLength - info.cut[1];
  const sourceBottomOffset = strand === 1 ? info.cut[1] : siteLength - info.cut[0];
  const rawTopCut = start + sourceTopOffset;
  const rawBottomCut = start + sourceBottomOffset;
  const topCut = circular ? modulo(rawTopCut, sequenceLength) : rawTopCut;
  const bottomCut = circular ? modulo(rawBottomCut, sequenceLength) : rawBottomCut;
  const overhangLo = Math.min(sourceTopOffset, sourceBottomOffset);
  const overhangHi = Math.max(sourceTopOffset, sourceBottomOffset);
  const overhangLength = overhangHi - overhangLo;
  const overhangType = overhangLength === 0
    ? 'blunt'
    : sourceTopOffset < sourceBottomOffset ? '5overhang' : '3overhang';

  return {
    occurrenceKey: `${enzyme}:${strand}:${start}`,
    enzyme,
    source: info.isCustom ? 'custom' : 'catalog',
    strand,
    recognition: {
      ...recognitionGeometry(start, siteLength, sequenceLength, circular),
      pattern: info.site,
      matchedTop: matchedSequence,
      // Compatibility names while existing consumers migrate to pattern/matchedTop.
      site: info.site,
      matchedSequence,
      length: siteLength,
    },
    topCut,
    bottomCut,
    topCutOffset: sourceTopOffset,
    bottomCutOffset: sourceBottomOffset,
    topCutUnwrapped: rawTopCut,
    bottomCutUnwrapped: rawBottomCut,
    overhang: {
      type: overhangType,
      seq: overhangLength > 0 ? matchedSequence.slice(overhangLo, overhangHi) : '',
      length: overhangLength,
    },
  };
}

export function isValidRestrictionEnzyme(info) {
  if (!info || typeof info !== 'object') return false;
  const site = String(info.site || '').toUpperCase();
  if (!regexSource(site) || !Array.isArray(info.cut) || info.cut.length !== 2) return false;
  if (!info.cut.every((cut) => Number.isInteger(cut) && cut >= 0 && cut <= site.length)) {
    return false;
  }
  // A palindromic recognition sequence has no observable strand orientation.
  // Asymmetric metadata would therefore assign two different cuts to the same
  // physical duplex; choosing the forward interpretation would be arbitrary.
  return reverseComplementIupac(site) !== site
    || info.cut[0] === site.length - info.cut[1];
}

function scanPattern(searchSequence, source, maxStart) {
  const regex = new RegExp(source, 'gi');
  const starts = [];
  let match;
  while ((match = regex.exec(searchSequence)) !== null) {
    if (match.index <= maxStart) starts.push(match.index);
    // Global RegExp normally skips overlapping sites. Restriction occurrences do not.
    regex.lastIndex = match.index + 1;
  }
  return starts;
}

/** Longest valid recognition site in a caller-supplied classical RE catalog. */
export function maxRecognitionLength(enzymes, names) {
  const selected = Array.isArray(names) ? names : Object.keys(enzymes || {});
  let max = 0;
  for (const name of selected) {
    const info = enzymes && enzymes[name];
    if (isValidRestrictionEnzyme(info)) max = Math.max(max, info.site.length);
  }
  return max;
}

/**
 * Scan a sequence into canonical occurrences.
 *
 * @param {string} sequence DNA sequence
 * @param {object} options
 * @param {boolean} [options.circular=false]
 * @param {Record<string, object>} options.enzymes classical Type II catalog
 * @param {string[]} [options.names] optional enzyme allow-list
 * @param {number} [options.minSiteLen=0] minimum full recognition length
 */
export function scanOccurrences(sequence, options = {}) {
  const seq = String(sequence || '').toUpperCase();
  const sequenceLength = seq.length;
  const {
    circular = false,
    enzymes = {},
    names = Object.keys(enzymes),
    minSiteLen = 0,
  } = options;
  if (!sequenceLength) return [];

  const selected = [...new Set((Array.isArray(names) ? names : []).filter(Boolean))];
  const maxSite = maxRecognitionLength(enzymes, selected);
  const searchSequence = circular && maxSite > 1
    ? seq + seq.slice(0, Math.min(sequenceLength, maxSite - 1))
    : seq;
  const out = [];

  for (const enzyme of selected) {
    const info = enzymes[enzyme];
    if (!isValidRestrictionEnzyme(info) || info.site.length < minSiteLen) continue;
    const site = info.site.toUpperCase();
    if (site.length > sequenceLength) continue;
    const maxStart = circular ? sequenceLength - 1 : sequenceLength - site.length;
    const strands = [{ strand: 1, motif: site }];
    const reverse = reverseComplementIupac(site);
    if (reverse !== site) strands.push({ strand: -1, motif: reverse });

    for (const { strand, motif } of strands) {
      const source = regexSource(motif);
      for (const start of scanPattern(searchSequence, source, maxStart)) {
        out.push(occurrenceFromMatch({
          enzyme,
          info: { ...info, site },
          strand,
          start,
          matchedSequence: searchSequence.slice(start, start + site.length),
          sequenceLength,
          circular: !!circular,
        }));
      }
    }
  }

  return out.sort((a, b) => (
    a.recognition.start - b.recognition.start
      || a.enzyme.localeCompare(b.enzyme)
      || b.strand - a.strand
  ));
}

export function occurrenceCuts(occurrence) {
  return occurrence
    ? { topCut: occurrence.topCut, bottomCut: occurrence.bottomCut }
    : null;
}

/**
 * Stable identity of one physical double-strand break. A top-strand bond alone
 * is insufficient: neoschizomers can share it while cutting the bottom strand
 * differently and therefore leave incompatible end chemistry.
 */
export function restrictionBreakKey(occurrence) {
  if (!occurrence || !Number.isFinite(occurrence.topCut)
    || !Number.isFinite(occurrence.bottomCut)
    || !occurrence.overhang
    || typeof occurrence.overhang.type !== 'string') return null;
  const rawDelta = Number.isFinite(occurrence.topCutUnwrapped)
    && Number.isFinite(occurrence.bottomCutUnwrapped)
    ? occurrence.bottomCutUnwrapped - occurrence.topCutUnwrapped
    : occurrence.bottomCut - occurrence.topCut;
  if (!Number.isFinite(rawDelta)) return null;
  return [
    occurrence.topCut,
    occurrence.bottomCut,
    rawDelta,
    occurrence.overhang.type,
    String(occurrence.overhang.seq || ''),
  ].join(':');
}

export function occurrenceLabelPosition(occurrence) {
  return occurrence && Number.isFinite(occurrence.topCut) ? occurrence.topCut : null;
}

/** Stable UI identity for a canonical occurrence, with a legacy site fallback. */
export function restrictionSiteKey(site) {
  if (!site || typeof site !== 'object') return null;
  const canonical = site.occurrence?.occurrenceKey || site.occurrenceKey;
  if (typeof canonical === 'string' && canonical) return canonical;
  return typeof site.enzyme === 'string' && Number.isFinite(site.position)
    ? `${site.enzyme}-${site.position}`
    : null;
}
