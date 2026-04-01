/**
 * Frontend GenBank parser — extracts sequence, metadata, and features
 * from pasted GenBank-formatted text.
 *
 * Returns { name, sequence, length, topology, features, organism, description }
 * where features match the format expected by importFeatures().
 */

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
  };

  let section = 'header'; // header | features | origin
  let currentFeature = null;
  let currentQualKey = null;
  let currentQualVal = '';
  let seqLines = [];

  function flushQualifier() {
    if (currentFeature && currentQualKey) {
      currentFeature.qualifiers[currentQualKey] = currentQualVal;
    }
    currentQualKey = null;
    currentQualVal = '';
  }

  function flushFeature() {
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
        const loc = parseLocationFull(locStr.trim());

        currentFeature = {
          type,
          start: loc.start,
          end: loc.end,
          strand: loc.strand,
          qualifiers: {},
        };

        if (loc.exons && loc.exons.length > 1) {
          currentFeature.qualifiers.exons = loc.exons;
        }
        continue;
      }

      // Qualifier line: 21+ spaces + /key="value" or /key=number or /flag
      const qualMatch = line.match(/^\s{21,}\/(\w+)(?:=(.*))?$/);
      if (qualMatch && currentFeature) {
        flushQualifier();
        const [, key, rawVal] = qualMatch;
        if (rawVal === undefined) {
          // Flag qualifier (no value)
          currentFeature.qualifiers[key] = true;
        } else {
          let val = rawVal;
          if (val.startsWith('"')) val = val.slice(1);
          if (val.endsWith('"')) {
            // Single-line value complete
            val = val.slice(0, -1);
            currentFeature.qualifiers[key] = val;
          } else {
            // Multiline value — start collecting
            currentQualKey = key;
            currentQualVal = val;
          }
        }
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

  // Assemble sequence
  result.sequence = seqLines.join('').toUpperCase();
  result.length = result.sequence.length;

  return result;
}

// ═══ Location parsing ═══

/**
 * Parse a full GenBank location string.
 * Handles: simple (1..900), complement(...), join(...), complement(join(...)).
 * @returns {{ start, end, strand, exons? }}
 */
function parseLocationFull(loc) {
  let strand = 1;
  let inner = loc;

  // Strip outer complement()
  if (inner.startsWith('complement(') && inner.endsWith(')')) {
    strand = -1;
    inner = inner.slice(11, -1);
  }

  // join() — possibly inside complement()
  if (inner.startsWith('join(') && inner.endsWith(')')) {
    const body = inner.slice(5, -1);
    const parts = splitTopLevel(body);
    const ranges = parts.map(parseSimpleRange);
    const start = Math.min(...ranges.map(r => r.start));
    const end = Math.max(...ranges.map(r => r.end));
    return { start, end, strand, exons: ranges };
  }

  // order() — treat like join
  if (inner.startsWith('order(') && inner.endsWith(')')) {
    const body = inner.slice(6, -1);
    const parts = splitTopLevel(body);
    const ranges = parts.map(parseSimpleRange);
    const start = Math.min(...ranges.map(r => r.start));
    const end = Math.max(...ranges.map(r => r.end));
    return { start, end, strand, exons: ranges };
  }

  // Simple range
  const r = parseSimpleRange(inner);
  return { start: r.start, end: r.end, strand };
}

/**
 * Split comma-separated parts respecting parentheses depth.
 */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSimpleRange(s) {
  let inner = s.trim();
  // Handle complement() around individual range within join
  if (inner.startsWith('complement(') && inner.endsWith(')')) {
    inner = inner.slice(11, -1);
  }
  // Remove < and > (partial indicators)
  inner = inner.replace(/[<>]/g, '');

  if (inner.includes('..')) {
    const [a, b] = inner.split('..');
    return { start: parseInt(a, 10) - 1, end: parseInt(b, 10) };
  }
  // Single position
  const pos = parseInt(inner, 10);
  if (isNaN(pos)) return { start: 0, end: 0 };
  return { start: pos - 1, end: pos };
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
