/**
 * Frontend GenBank parser — extracts sequence, metadata, and features
 * from pasted GenBank-formatted text.
 *
 * Returns { name, sequence, length, topology, features, organism, description }
 * where features match the format expected by importFeatures().
 */
import { sanitizeSequence } from './sequence-utils';
import { parseGenBankLocation, getSegments, locationSpan } from './lib/annotation-location';

/**
 * Parse GenBank text into structured data.
 * @param {string} text — raw GenBank content
 * @returns {{ name, sequence, length, topology, organism, description, features: Array<{type, start, end, strand, qualifiers}> }}
 */
export function parseGenBank(text) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/\r?\n/);
  const result = {
    name: '',
    sequence: '',
    length: 0,
    topology: 'linear',
    organism: '',
    description: '',
    features: [],
    // ANN-0I — features whose location could not be read. Structured so the
    // ingress can turn them into a visible partial-import warning.
    rejected: [],
  };

  let section = 'header'; // header | features | origin
  let currentFeature = null;
  let currentQualKey = null;
  let currentQualVal = '';
  let seqLines = [];

  // ANN-0I — a location may wrap across lines (NCBI wraps at column 80), so
  // the text is accumulated and parsed exactly once, when the first qualifier
  // or the next feature ends it. Parsing the first line alone turned
  // `join(101..150,\n 201..250)` into a single 50 bp span.
  let pendingType = null;
  let pendingLoc = '';

  /**
   * Store one qualifier, preserving repetition. INSDC allows the same key many
   * times (/note, /db_xref, /EC_number); overwriting kept only the last and
   * silently discarded a biologist's provenance.
   */
  function setQualifier(key, val) {
    if (!currentFeature) return;
    const q = currentFeature.qualifiers;
    if (!(key in q)) { q[key] = val; return; }
    if (Array.isArray(q[key])) q[key].push(val);
    else q[key] = [q[key], val];
  }

  function finalizeFeature() {
    if (pendingType == null) return;
    const type = pendingType;
    const locStr = pendingLoc.trim();
    pendingType = null;
    pendingLoc = '';

    const loc = parseLocationFull(locStr);
    // ANN-0I — an unparsable location is skipped rather than coerced to 0..0
    // (a feature with invented coordinates is worse than a missing one), but it
    // is RECORDED so the UI can report a partial import. It must not abort the
    // features that follow.
    if (!loc) {
      result.rejected.push({
        name: type,
        reason: `unparsable location "${locStr}"`,
      });
      currentFeature = null;
      return;
    }

    const span = locationSpan({ location: loc.location });
    currentFeature = {
      type,
      location: loc.location,
      start: span.start,
      end: span.end,
      strand: loc.strand,
      qualifiers: {},
    };

    // Legacy side channel: a NON-wrapping multi-segment location still
    // surfaces its exons so importFeatures can derive intron details.
    // An origin-crossing join has no introns — the gap is the origin.
    const segs = getSegments(currentFeature);
    if (segs.length > 1 && span.end > span.start) {
      currentFeature.qualifiers.exons = segs;
    }
  }

  function flushQualifier() {
    if (currentFeature && currentQualKey) {
      setQualifier(currentQualKey, currentQualVal);
    }
    currentQualKey = null;
    currentQualVal = '';
  }

  function flushFeature() {
    finalizeFeature();
    flushQualifier();
    if (currentFeature) {
      result.features.push(currentFeature);
    }
    currentFeature = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── End of record ──
    if (line.startsWith('//')) break;

    // ── ORIGIN section ──
    if (line.startsWith('ORIGIN')) {
      flushFeature();
      section = 'origin';
      continue;
    }
    if (section === 'origin') {
      // Sequence lines: number + bases
      seqLines.push(line.replace(/[\s0-9]/g, ''));
      continue;
    }

    // ── FEATURES section start ──
    if (line.startsWith('FEATURES')) {
      section = 'features';
      continue;
    }

    // ── Parse FEATURES ──
    if (section === 'features') {
      // New feature: 5 spaces + type + spaces + location
      const featMatch = line.match(/^     (\S+)\s+(.+)$/);
      if (featMatch && !line.match(/^\s{21,}\//)) {
        flushFeature();
        const [, type, locStr] = featMatch;
        // Start accumulating; the location may continue on the next lines.
        pendingType = type;
        pendingLoc = locStr.trim();
        continue;
      }

      // Qualifier line: 21+ spaces + /key="value" or /key=number or /flag.
      // The first one also ends the location.
      const qualMatch = line.match(/^\s{21,}\/(\w+)(?:=(.*))?$/);
      if (qualMatch && (currentFeature || pendingType != null)) {
        finalizeFeature();
        if (!currentFeature) continue;
        flushQualifier();
        const [, key, rawVal] = qualMatch;
        if (rawVal === undefined) {
          // Flag qualifier (no value)
          setQualifier(key, true);
        } else {
          let val = rawVal;
          if (val.startsWith('"')) val = val.slice(1);
          if (val.endsWith('"')) {
            // Single-line value complete
            val = val.slice(0, -1);
            setQualifier(key, val);
          } else {
            // Multiline value — start collecting
            currentQualKey = key;
            currentQualVal = val;
          }
        }
        continue;
      }

      // Continuation of a wrapped LOCATION (indented, no leading slash, and no
      // qualifier has started yet for this feature).
      if (pendingType != null && line.match(/^\s{21,}/)) {
        pendingLoc += line.trim();
        continue;
      }

      // Continuation of multiline qualifier value
      if (currentQualKey && currentFeature && line.match(/^\s{21,}/)) {
        let cont = line.trim();
        // No space for sequence-like qualifiers (translation, codon_start, etc.)
        const noSpace = /^(translation|codon_start|transl_table)$/.test(currentQualKey);
        const sep = noSpace ? '' : (currentQualVal ? ' ' : '');
        if (cont.endsWith('"')) {
          cont = cont.slice(0, -1);
          currentQualVal += sep + cont;
          flushQualifier();
        } else {
          currentQualVal += sep + cont;
        }
        continue;
      }

      continue;
    }

    // ── Header section ──
    if (section === 'header') {
      if (line.startsWith('LOCUS')) {
        const m = line.match(/LOCUS\s+(\S+)\s+(\d+)\s+bp/);
        if (m) {
          result.name = m[1];
          result.length = parseInt(m[2], 10);
        }
        if (/circular/i.test(line)) result.topology = 'circular';
        continue;
      }
      if (line.startsWith('DEFINITION')) {
        result.description = line.slice(12).trim().replace(/\.$/, '');
        continue;
      }
      if (line.startsWith('  ORGANISM')) {
        result.organism = line.replace(/^\s+ORGANISM\s+/, '').trim();
        continue;
      }
    }
  }

  // Flush last feature
  flushFeature();

  // Assemble sequence (sanitize at entry — strips BOM, whitespace, digits, non-IUPAC)
  result.sequence = sanitizeSequence(seqLines.join(''));
  result.length = result.sequence.length;

  return result;
}

// ═══ Location parsing ═══

/**
 * Parse a GenBank location string into the canonical model.
 *
 * The INSDC grammar (simple / complement / join / order, `<` `>` partials) lives
 * in `lib/annotation-location.js` — this parser must not carry a second copy of
 * the ±1 conversion. Returns `null` when the string cannot be parsed, so the
 * caller can drop the feature instead of inventing coordinates.
 *
 * @returns {{ location, strand } | null}
 */
function parseLocationFull(loc) {
  try {
    return parseGenBankLocation(loc);
  } catch {
    return null;
  }
}

/**
 * Detect if text looks like GenBank format.
 * @param {string} text
 * @returns {boolean}
 */
export function isGenBankFormat(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trimStart();
  return trimmed.startsWith('LOCUS') ||
         (trimmed.includes('FEATURES') && trimmed.includes('ORIGIN'));
}
