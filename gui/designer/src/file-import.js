/**
 * Shared file import logic for GenBank, FASTA, and SnapGene .dna files.
 *
 * Sprint M-B.1 K1 split (DEC-IMP-09):
 *   - parseFile(file)               — sync parsing + sanitize + importFeatures (no enrichment)
 *   - enrichAnnotations(item, opts) — async homology + detail-level enrichment
 *   - handleFileImport(file, opts)  — back-compat wrapper used by v0.5 ImportStartScreen
 *
 * One flag controls enrichment: `autoAnnotate` (default true). Replaces the v0.5
 * 4-combination per-file controls (DEC-IMP-09 rewrite).
 */

import { parseGenBank, isGenBankFormat } from './genbank-parser';
import { importFeatures } from './import-annotations';
import { sanitizeSequence } from './sequence-utils';

export const ACCEPT_STRING = '.gb,.gbk,.genbank,.dna,.fasta,.fa,.fna';

const TEMP_NAME_RE = /^tmp[a-z0-9_]{3,}$/i;

export function extractItemName(parsed, file, fallbackIndex = 1) {
  const internal = (parsed?.name || '').trim();
  const isTemp = internal && TEMP_NAME_RE.test(internal);
  const isUnknown = internal && internal.startsWith('<');
  if (internal && !isTemp && !isUnknown) return internal;
  const fname = (file?.name || '').replace(/\.[^.]+$/, '').trim();
  if (fname) return fname;
  return `part_${fallbackIndex}`;
}

export function parseFasta(text) {
  const lines = text.split(/\r?\n/);
  let name = '';
  const seqParts = [];
  for (const line of lines) {
    if (line.startsWith('>')) {
      if (!name) name = line.slice(1).trim().split(/\s+/)[0];
    } else {
      seqParts.push(line.replace(/\s/g, ''));
    }
  }
  const sequence = sanitizeSequence(seqParts.join(''));
  return { name: name || 'imported', sequence, length: sequence.length, topology: 'linear', features: [] };
}

function isFasta(text) {
  return text.trimStart().startsWith('>');
}

const API_BASE = '';

async function importViaBackend(file) {
  const form = new FormData();
  form.append('file', file);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/import`, { method: 'POST', body: form });
  } catch (e) {
    // fetch() throws TypeError("Failed to fetch") when the backend isn't
    // running — give the biolog the actual remediation instead of the
    // browser's opaque message.
    throw new Error(
      '.dna requires the Python backend (it isn\'t running). Start it from '
      + 'gui/designer with `npm run dev:back`, or use a .gb / .fasta export '
      + 'of the same molecule.',
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Backend error ${res.status}`);
  }
  return res.json();
}

/**
 * Synchronous parse step — no enrichment, no auto-annotate.
 *
 * Returns a ParsedItem shape:
 *   { name, sequence, length, topology, ends?, organism, description,
 *     annotations, _fromFileCount, _ext, _metadata? }
 *
 * `_fromFileCount` tells callers how many features came from the file (vs
 * potential later enrichment). `_metadata` is preserved for .dna primers
 * (PrimerWizardStepModal in K6 reads `_metadata.primers`).
 *
 * @param {File} file
 * @returns {Promise<Object>}
 */
export async function parseFile(file) {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

  if (ext === '.dna') {
    const data = await importViaBackend(file);
    if (data.sequence) data.sequence = sanitizeSequence(data.sequence);
    if (data.length != null) data.length = data.sequence?.length ?? data.length;
    let annotations = [];
    if (data.features?.length > 0) {
      const result = importFeatures(data.features, data.length, 'genbank');
      annotations = result.annotations || [];
    }
    return {
      name: extractItemName(data, file),
      sequence: data.sequence || '',
      length: data.length || (data.sequence?.length ?? 0),
      topology: data.topology || 'linear',
      organism: data.organism || '',
      description: data.description || '',
      annotations,
      _fromFileCount: annotations.length,
      _ext: ext,
      _metadata: data.metadata || null,
    };
  }

  const text = await file.text();
  let parsed;
  if (isGenBankFormat(text) || ['.gb', '.gbk', '.genbank'].includes(ext)) {
    parsed = parseGenBank(text);
    if (!parsed?.sequence) throw new Error('Could not parse GenBank file');
  } else if (isFasta(text) || ['.fasta', '.fa', '.fna'].includes(ext)) {
    parsed = parseFasta(text);
  } else {
    try { parsed = parseGenBank(text); } catch { /* ignore */ }
    if (!parsed?.sequence) parsed = parseFasta(text);
  }

  if (!parsed?.sequence) throw new Error('No sequence found in file');

  let annotations = [];
  if (parsed.features?.length > 0) {
    const result = importFeatures(parsed.features, parsed.sequence.length, 'genbank');
    annotations = result.annotations || [];
  }

  return {
    name: extractItemName(parsed, file),
    sequence: parsed.sequence,
    length: parsed.length || parsed.sequence.length,
    topology: parsed.topology || 'linear',
    organism: parsed.organism || '',
    description: parsed.description || '',
    annotations,
    _fromFileCount: annotations.length,
    _ext: ext,
    _metadata: null,
  };
}

/**
 * Asynchronous enrichment step — homology naming + detail-level auto-annotate.
 *
 * Single flag (DEC-IMP-09): `autoAnnotate=true` runs `enrichWithCommonFeatures`
 * + autoAnnotate detail enrichment; `autoAnnotate=false` returns annotations
 * unchanged. Replaces the v0.5 4-combination per-file controls.
 *
 * Returns the parsedItem with `annotations` possibly extended. Mutates a copy,
 * not the input. If the auto-annotate module is unavailable (e.g. in tests),
 * silently returns the item unchanged.
 *
 * @param {Object} parsedItem — output of parseFile
 * @param {{ autoAnnotate?: boolean }} [opts]
 * @returns {Promise<Object>}
 */
export async function enrichAnnotations(parsedItem, opts = {}) {
  const enabled = opts.autoAnnotate !== false;
  if (!enabled || !parsedItem?.sequence) return parsedItem;

  let mod;
  try {
    mod = await import('./auto-annotate');
  } catch {
    return parsedItem;
  }
  const { autoAnnotate, enrichWithCommonFeatures } = mod;
  if (typeof autoAnnotate !== 'function' || typeof enrichWithCommonFeatures !== 'function') {
    return parsedItem;
  }

  const sequence = parsedItem.sequence;
  const name = parsedItem.name || 'imported';
  const fromFileCount = parsedItem._fromFileCount ?? parsedItem.annotations?.length ?? 0;
  let annotations = Array.isArray(parsedItem.annotations) ? [...parsedItem.annotations] : [];

  if (annotations.length === 0) {
    const base = autoAnnotate({ name, type: 'misc_feature', sequence });
    annotations = await enrichWithCommonFeatures(sequence, base);
  } else {
    annotations = await enrichWithCommonFeatures(sequence, annotations);
    for (const ann of annotations) {
      if (ann.knownFeature && ann.level === 'region') {
        ann.originalName = ann.name;
        ann.name = ann.knownFeature;
      }
    }
    const withDetails = autoAnnotate({ name, type: 'misc_feature', sequence, annotations });
    const existingKeys = new Set(annotations.map(a => `${a.start}-${a.end}-${a.level}`));
    for (const ann of withDetails) {
      const key = `${ann.start}-${ann.end}-${ann.level}`;
      if (!existingKeys.has(key) && ann.level !== 'region') {
        annotations.push(ann);
      }
    }
  }

  return { ...parsedItem, annotations, _fromFileCount: fromFileCount };
}

/**
 * Back-compat wrapper for v0.5 ImportStartScreen and other callers.
 * Equivalent to: `enrichAnnotations(await parseFile(file), opts)`.
 *
 * Strips `_fromFileCount`, `_ext`, `_metadata` from the returned shape to
 * match the v0.5 contract used by AddFragmentModal / ImportStartScreen.
 *
 * @param {File} file
 * @param {{ autoAnnotate?: boolean }} [opts]
 */
export async function handleFileImport(file, opts = {}) {
  const parsed = await parseFile(file);
  const enriched = await enrichAnnotations(parsed, opts);
  return {
    name: enriched.name,
    sequence: enriched.sequence,
    length: enriched.length,
    topology: enriched.topology,
    organism: enriched.organism,
    description: enriched.description,
    annotations: enriched.annotations,
  };
}

/**
 * Sequentially parse multiple files into ParsedItem[]. Ordering matches input.
 * Errors on individual files are surfaced as `{ _fileName, _error }` entries.
 *
 * @param {File[]} files
 * @returns {Promise<Array<Object>>}
 */
export async function handleFilesImport(files, opts = {}) {
  const results = [];
  for (const f of files || []) {
    try {
      const data = await handleFileImport(f, opts);
      results.push({ ...data, _fileName: f.name });
    } catch (err) {
      results.push({
        _fileName: f.name,
        _error: err.message || String(err),
        sequence: '', length: 0, annotations: [], topology: 'linear', name: f.name,
      });
    }
  }
  return results;
}
