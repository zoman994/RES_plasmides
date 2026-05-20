/**
 * bodge-snapgene-loss-detect — robust GenBank COMMENT provenance round-trip.
 *
 * Goal: provenance payload (base64-JSON) survives ANY third-party GenBank
 * round-trip (SnapGene, ApE, Geneious, NCBI, pLannotate). Worst case is:
 *   - 80-char hard wrap (FASTA-style).
 *   - Leading whitespace on each continuation line (`COMMENT     <text>`).
 *   - Mixed CRLF / LF.
 *   - Interleaved blank "    " lines.
 *
 * Strategy: payload is wrapped in explicit markers
 *   ##BodgeGene-Provenance-START##
 *   ##BodgeGene-Provenance-END##
 * On encode the payload is wrapped at 60 chars to stay well under the
 * 80-char GenBank line limit. On decode we walk the COMMENT body, strip
 * leading whitespace from each line, concatenate everything between
 * START / END markers, and base64-decode.
 *
 * No external deps — uses TextEncoder / btoa / atob (browser-native).
 * Node test env: vitest happy-dom polyfills btoa/atob.
 */

const PROVENANCE_START = '##BodgeGene-Provenance-START##';
const PROVENANCE_END = '##BodgeGene-Provenance-END##';
// Short identifier — full schema URL lives in spec docs. Keeping the header
// short means it always fits inside the 60-col wrap budget so third-party
// reformatters never split it mid-URL.
const PROVENANCE_SCHEMA_ID = 'container-provenance-v1';

const WRAP_COLS = 60;
const COMMENT_INDENT = '            ';

function utf8ToBase64(str) {
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  throw new Error('utf8ToBase64: no available base64 encoder');
}

function base64ToUtf8(b64) {
  if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  throw new Error('base64ToUtf8: no available base64 decoder');
}

function chunkString(s, width) {
  const out = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out;
}

/**
 * Encode a provenance payload object into a GenBank-safe COMMENT block.
 * Returns a multi-line string ready to be inserted after `COMMENT     ` field.
 * Lines: header (`schema`/`format`/`payload`) + base64 chunked at 60 cols
 * between explicit START/END markers.
 *
 * The caller is responsible for prepending the GenBank "COMMENT     "
 * keyword on the first line — this helper returns the BODY only.
 */
export function encodeProvenanceComment(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('encodeProvenanceComment: payload object required');
  }
  const json = JSON.stringify(payload);
  const b64 = utf8ToBase64(json);
  const lines = [];
  lines.push(PROVENANCE_START);
  lines.push(`schema  :: ${PROVENANCE_SCHEMA_ID}`);
  lines.push('format  :: base64-json');
  lines.push('payload ::');
  for (const chunk of chunkString(b64, WRAP_COLS)) lines.push(chunk);
  lines.push(PROVENANCE_END);
  return lines.join('\n');
}

/**
 * Format an encoded COMMENT block with the GenBank `COMMENT` keyword and
 * 12-space continuation indent — ready to splice into a .gb file.
 */
export function formatCommentBlock(provenanceBody) {
  const lines = provenanceBody.split('\n');
  if (!lines.length) return '';
  const out = [];
  out.push(`COMMENT     ${lines[0]}`);
  for (let i = 1; i < lines.length; i++) out.push(`${COMMENT_INDENT}${lines[i]}`);
  return out.join('\n');
}

/**
 * Extract the entire COMMENT section from a GenBank string. Returns the
 * body lines (without the `COMMENT` keyword on first line and without the
 * 12-space continuation indent on subsequent lines). Returns null if no
 * COMMENT section exists.
 *
 * Handles: CRLF/LF, mixed indentation, COMMENT terminated by next top-level
 * keyword (FEATURES / ORIGIN / // or another all-caps keyword at column 0).
 */
export function extractCommentSection(gbText) {
  if (!gbText) return null;
  const lines = gbText.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !/^COMMENT(\s+|$)/.test(lines[i])) i++;
  if (i >= lines.length) return null;
  const body = [];
  // Drop first 12 chars from the COMMENT header line (or whatever indent
  // the COMMENT keyword consumes). The standard is `COMMENT     ` (7+5=12
  // chars). Be tolerant: strip "COMMENT" + any whitespace.
  const first = lines[i].replace(/^COMMENT\s*/, '');
  body.push(first);
  i++;
  while (i < lines.length) {
    const line = lines[i];
    // GenBank top-level keywords start at column 0. Continuation lines are
    // indented. The COMMENT section ends at the next column-0 keyword.
    if (/^[A-Z/]/.test(line)) break;
    // Strip leading whitespace — typical 12 chars, but be tolerant of
    // SnapGene/Geneious reflows that may use 5 or 8 spaces.
    body.push(line.replace(/^\s+/, ''));
    i++;
  }
  return body.join('\n');
}

/**
 * Decode a provenance payload from any GenBank text (COMMENT-bearing or not).
 *
 * Returns:
 *   { payload, lossDetected, normalization, raw }
 * where:
 *   payload         — the decoded provenance object, or null.
 *   lossDetected    — array of strings describing recoverable losses
 *                     (e.g. 'multi-line-reassembly', 'whitespace-strip').
 *   normalization   — array describing normalization steps applied.
 *   raw             — the base64 string that was decoded (debug).
 *
 * If the markers are not found or base64 fails, returns
 *   { payload: null, lossDetected: [...], normalization: [], raw: null }.
 */
export function decodeProvenanceComment(gbText) {
  const result = { payload: null, lossDetected: [], normalization: [], raw: null };
  const comment = extractCommentSection(gbText);
  if (!comment) {
    result.lossDetected.push('no-comment-section');
    return result;
  }
  const startIdx = comment.indexOf(PROVENANCE_START);
  const endIdx = comment.indexOf(PROVENANCE_END);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    result.lossDetected.push('markers-missing-or-out-of-order');
    return result;
  }
  const between = comment.slice(startIdx + PROVENANCE_START.length, endIdx);
  // Drop header lines (`schema      ::`, `format      ::`, `payload     ::`)
  // — everything that's not pure base64. base64 alphabet = A-Z a-z 0-9 + / =.
  const lines = between.split('\n');
  let inPayload = false;
  const b64Parts = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^payload\s*::/i.test(line)) { inPayload = true; continue; }
    if (/^schema\s*::/i.test(line) || /^format\s*::/i.test(line)) continue;
    if (!inPayload) {
      // Tolerant fallback: some reformatters may strip the `payload ::`
      // marker. If line looks like base64, accept it.
      if (/^[A-Za-z0-9+/=]+$/.test(line)) {
        inPayload = true;
        result.lossDetected.push('payload-marker-missing');
      } else {
        continue;
      }
    }
    // Strict base64 only — silently drop reformatter-inserted noise.
    // Header lines that survived wrap (e.g. wrapped URL fragments) might
    // appear here; they don't break decode because they fail the regex.
    if (/^[A-Za-z0-9+/=]+$/.test(line)) {
      b64Parts.push(line);
    }
  }
  if (b64Parts.length > 1) result.normalization.push('multi-line-reassembly');
  const b64 = b64Parts.join('');
  if (!b64) {
    result.lossDetected.push('empty-payload');
    return result;
  }
  result.raw = b64;
  let json;
  try {
    json = base64ToUtf8(b64);
  } catch (e) {
    result.lossDetected.push(`base64-decode-failed:${e?.message || 'unknown'}`);
    return result;
  }
  try {
    result.payload = JSON.parse(json);
  } catch (e) {
    result.lossDetected.push(`json-parse-failed:${e?.message || 'unknown'}`);
    return result;
  }
  return result;
}

/**
 * Quick boolean — does this GenBank text contain a BodgeGene provenance
 * COMMENT block (regardless of whether decode actually succeeds)?
 */
export function hasProvenanceMarkers(gbText) {
  if (!gbText) return false;
  return gbText.includes(PROVENANCE_START) && gbText.includes(PROVENANCE_END);
}

/**
 * Diff helper for K0 / K13 round-trip tests. Compares an original .gb
 * (BodgeGene export) vs the round-tripped .gb (after a third-party tool
 * round-trip). Returns:
 *   {
 *     sequenceMatch: boolean,
 *     featuresPreserved: boolean,        // count + locations
 *     qualifiersPreserved: boolean,      // /bodge_id / /color / /label
 *     provenancePreserved: boolean,      // decode succeeded both sides
 *     provenancePayloadMatch: boolean,   // JSON.stringify equal
 *     losses: string[],                  // human-readable list
 *   }
 *
 * Parsers are intentionally lightweight — only the fields we care about.
 */
export function compareGenBankRoundTrip(original, roundTrip) {
  const losses = [];
  const o = parseLightGenBank(original);
  const r = parseLightGenBank(roundTrip);
  const sequenceMatch =
    (o.sequence || '').toLowerCase() === (r.sequence || '').toLowerCase();
  if (!sequenceMatch) losses.push('sequence-differs');
  const featuresPreserved = o.features.length === r.features.length;
  if (!featuresPreserved) {
    losses.push(`feature-count-changed:${o.features.length}->${r.features.length}`);
  }
  // Compare qualifiers per feature index. Only the BodgeGene-specific ones —
  // third-party tools may add their own qualifiers (e.g. ApEinfo_*).
  let qualifiersPreserved = true;
  const minLen = Math.min(o.features.length, r.features.length);
  for (let i = 0; i < minLen; i++) {
    const ofs = o.features[i];
    const rfs = r.features[i];
    for (const q of ['bodge_id', 'parent_feature', 'color', 'label']) {
      if ((ofs.qualifiers[q] || null) !== (rfs.qualifiers[q] || null)) {
        qualifiersPreserved = false;
        losses.push(`qualifier-changed:${q}@feature-${i}`);
      }
    }
  }
  const oProv = decodeProvenanceComment(original);
  const rProv = decodeProvenanceComment(roundTrip);
  const provenancePreserved = !!(oProv.payload && rProv.payload);
  if (!provenancePreserved) losses.push('provenance-decode-failed');
  let provenancePayloadMatch = false;
  if (provenancePreserved) {
    try {
      provenancePayloadMatch =
        JSON.stringify(oProv.payload) === JSON.stringify(rProv.payload);
      if (!provenancePayloadMatch) losses.push('provenance-payload-differs');
    } catch {
      losses.push('provenance-payload-stringify-failed');
    }
  }
  return {
    sequenceMatch,
    featuresPreserved,
    qualifiersPreserved,
    provenancePreserved,
    provenancePayloadMatch,
    losses,
  };
}

/**
 * Minimal GenBank parser used only by compareGenBankRoundTrip. Extracts
 * the ORIGIN sequence and the FEATURES table (location + qualifiers).
 * NOT a general-purpose parser — use lib/bodge-container-genbank.js for
 * real reads.
 */
export function parseLightGenBank(gbText) {
  if (!gbText) return { sequence: '', features: [] };
  const lines = gbText.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let inFeatures = false;
  let inOrigin = false;
  const features = [];
  let seq = '';
  let cur = null;
  while (i < lines.length) {
    const line = lines[i];
    if (/^FEATURES\s/.test(line)) { inFeatures = true; inOrigin = false; i++; continue; }
    if (/^ORIGIN(\s|$)/.test(line)) { inFeatures = false; inOrigin = true; i++; continue; }
    if (/^\/\/(\s|$)/.test(line)) { break; }
    if (inFeatures) {
      // Feature line shape: "     gene            17..51"
      // Qualifier line shape: "                     /label=\"foo\""
      const featureMatch = line.match(/^ {5}(\S+)\s+(\S+.*)$/);
      const qualMatch = line.match(/^ {21}\/(\w+)(?:=(.*))?$/);
      if (featureMatch) {
        if (cur) features.push(cur);
        cur = { type: featureMatch[1], location: featureMatch[2], qualifiers: {} };
      } else if (qualMatch && cur) {
        const key = qualMatch[1];
        let value = qualMatch[2] || '';
        if (value.startsWith('"')) value = value.replace(/^"/, '').replace(/"$/, '');
        cur.qualifiers[key] = value;
      } else if (cur && /^ {21}/.test(line)) {
        // Continuation of a qualifier value — append.
        const last = Object.keys(cur.qualifiers).pop();
        if (last) cur.qualifiers[last] += line.replace(/^ {21}/, '');
      }
    } else if (inOrigin) {
      // Origin line shape: "        1 atgcatatga ..."
      const stripped = line.replace(/^\s*\d+\s+/, '').replace(/[^a-zA-Z]/g, '');
      seq += stripped.toLowerCase();
    }
    i++;
  }
  if (cur) features.push(cur);
  return { sequence: seq, features };
}

/**
 * Simulator helpers — produce synthetic "reformatted" GenBank texts that
 * mimic specific third-party tools' known behaviors. Used by K0 / K13
 * tests to verify decode robustness without needing the real tool installed.
 *
 * SnapGene tendency (observed in community reports):
 *   - Hard-wraps long COMMENT lines at 79 chars.
 *   - Preserves indentation on continuation lines (12 spaces).
 *   - Drops empty continuation lines.
 *
 * ApE tendency:
 *   - Re-wraps COMMENT to its own width (sometimes 64).
 *   - May strip leading spaces and prepend its own 5-space indent.
 *
 * NCBI canonical:
 *   - Wraps at 79 chars.
 *   - Uses 12-space continuation indent.
 *
 * Geneious tendency:
 *   - Re-formats all whitespace to 12-space indent.
 *
 * pLannotate:
 *   - Strips COMMENT entirely when re-annotating. (We test that decode
 *     gracefully fails with `lossDetected: 'no-comment-section'`.)
 */
export function simulateThirdPartyRoundTrip(gbText, tool) {
  switch ((tool || '').toLowerCase()) {
    case 'snapgene':
      return rewrapComment(gbText, { width: 79, indent: 12, dropBlanks: true });
    case 'ape':
      return rewrapComment(gbText, { width: 64, indent: 5, dropBlanks: false });
    case 'ncbi':
      return rewrapComment(gbText, { width: 79, indent: 12, dropBlanks: false });
    case 'geneious':
      return rewrapComment(gbText, { width: 79, indent: 12, dropBlanks: true });
    case 'plannotate':
      return stripCommentSection(gbText);
    default:
      return gbText;
  }
}

function rewrapComment(gbText, { width, indent, dropBlanks }) {
  if (!gbText) return gbText;
  const lines = gbText.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  // Find COMMENT block.
  while (i < lines.length && !/^COMMENT(\s+|$)/.test(lines[i])) i++;
  if (i >= lines.length) return gbText;
  const commentStart = i;
  i++;
  while (i < lines.length && !/^[A-Z/]/.test(lines[i])) i++;
  const commentEnd = i;
  // Re-extract body, strip indents, then re-wrap.
  const bodyLines = [];
  bodyLines.push(lines[commentStart].replace(/^COMMENT\s*/, ''));
  for (let j = commentStart + 1; j < commentEnd; j++) {
    const stripped = lines[j].replace(/^\s+/, '');
    if (!stripped && dropBlanks) continue;
    bodyLines.push(stripped);
  }
  // Re-wrap each body line at `width` columns (minus indent budget).
  const wrapTarget = Math.max(20, width - indent);
  const wrapped = [];
  for (const ln of bodyLines) {
    if (!ln) { wrapped.push(''); continue; }
    if (ln.length <= wrapTarget) { wrapped.push(ln); continue; }
    for (let k = 0; k < ln.length; k += wrapTarget) {
      wrapped.push(ln.slice(k, k + wrapTarget));
    }
  }
  const pad = ' '.repeat(indent);
  const out = lines.slice(0, commentStart).concat([]);
  out.push(`COMMENT${' '.repeat(Math.max(1, indent - 'COMMENT'.length))}${wrapped[0]}`);
  for (let k = 1; k < wrapped.length; k++) {
    out.push(`${pad}${wrapped[k]}`);
  }
  return out.concat(lines.slice(commentEnd)).join('\n');
}

function stripCommentSection(gbText) {
  if (!gbText) return gbText;
  const lines = gbText.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inComment = false;
  for (const line of lines) {
    if (/^COMMENT(\s+|$)/.test(line)) { inComment = true; continue; }
    if (inComment && /^[A-Z/]/.test(line)) inComment = false;
    if (!inComment) out.push(line);
  }
  return out.join('\n');
}

export const _internals = {
  PROVENANCE_START,
  PROVENANCE_END,
  PROVENANCE_SCHEMA_ID,
  WRAP_COLS,
  COMMENT_INDENT,
  utf8ToBase64,
  base64ToUtf8,
  chunkString,
};
