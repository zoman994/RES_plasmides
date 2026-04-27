/**
 * Shared file import logic for GenBank, FASTA, and SnapGene .dna files.
 * Used by PartsPalette (file button) and App.jsx (OS drag-and-drop).
 */

import { parseGenBank, isGenBankFormat } from './genbank-parser';
import { importFeatures } from './import-annotations';
import { sanitizeSequence } from './sequence-utils';

export const ACCEPT_STRING = '.gb,.gbk,.genbank,.dna,.fasta,.fa,.fna';

// Patterns for backend-leaked temp-file basenames (e.g. tmpe2oww0me, tmpA1B2C3).
const TEMP_NAME_RE = /^tmp[a-z0-9_]{3,}$/i;

/**
 * Determine the best human-readable name for a parsed file.
 * Priority:
 *   1. Internal record name from the format (LOCUS, FASTA header, SnapGene metadata)
 *      — but reject backend tempfile leaks (tmpXXXXX) and `<unknown...>` markers.
 *   2. Original file.name without extension (the upload's actual filename).
 *   3. `part_${fallbackIndex}` fallback (caller supplies).
 *
 * @param {{name?: string}} parsed — parser output.
 * @param {{name?: string} | null} file — original File object (or null for paste/catalog).
 * @param {number} fallbackIndex — index for `part_N` fallback (default 1).
 * @returns {string}
 */
export function extractItemName(parsed, file, fallbackIndex = 1) {
  const internal = (parsed?.name || '').trim();
  const isTemp = internal && TEMP_NAME_RE.test(internal);
  const isUnknown = internal && internal.startsWith('<');
  if (internal && !isTemp && !isUnknown) return internal;
  const fname = (file?.name || '').replace(/\.[^.]+$/, '').trim();
  if (fname) return fname;
  return `part_${fallbackIndex}`;
}

/** Parse FASTA text → { name, sequence, length, topology }. */
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

/**
 * Read a File object, parse it, return structured data for AddFragmentModal.
 * @param {File} file
 * @returns {Promise<{ name, sequence, length, topology, organism, description, annotations }>}
 */
/** Backend API base URL. */
const API_BASE = '';

/**
 * Import a .dna file via backend API (binary SnapGene format).
 * Falls back gracefully if backend is unavailable.
 */
async function importViaBackend(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/import`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Backend error ${res.status}`);
  }
  return res.json();
}

export async function handleFileImport(file) {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

  // .dna files are binary — must go through backend
  if (ext === '.dna') {
    const data = await importViaBackend(file);
    // Sanitize backend-returned sequence — Python parser may emit non-IUPAC bytes
    if (data.sequence) data.sequence = sanitizeSequence(data.sequence);
    if (data.length != null) data.length = data.sequence?.length ?? data.length;
    let annotations = [];
    if (data.features?.length > 0) {
      const result = importFeatures(data.features, data.length, 'genbank');
      annotations = result.annotations || [];
    }

    // Enrichment: always run after import (even if features > 0)
    if (data.sequence) {
      try {
        const { autoAnnotate, enrichWithCommonFeatures } = await import('./auto-annotate');

        if (annotations.length === 0) {
          // Fallback: no features from backend → full auto-annotation
          const base = autoAnnotate({
            name: data.name || 'imported',
            type: 'misc_feature',
            sequence: data.sequence,
          });
          annotations = await enrichWithCommonFeatures(data.sequence, base);
        } else {
          // Features exist → enrich with homology naming + detail detection
          // 1. Homology-based naming via common-features.json
          annotations = await enrichWithCommonFeatures(data.sequence, annotations);
          for (const ann of annotations) {
            if (ann.knownFeature && ann.level === 'region') {
              ann.originalName = ann.name;
              ann.name = ann.knownFeature;
            }
          }

          // 2. Detail-level enrichment (signal peptides, tags, domains)
          const withDetails = autoAnnotate({
            name: data.name || 'imported',
            type: 'misc_feature',
            sequence: data.sequence,
            annotations,
          });
          const existingKeys = new Set(annotations.map(a => `${a.start}-${a.end}-${a.level}`));
          for (const ann of withDetails) {
            const key = `${ann.start}-${ann.end}-${ann.level}`;
            if (!existingKeys.has(key) && ann.level !== 'region') {
              annotations.push(ann);
            }
          }
        }
      } catch { /* enrichment not available */ }
    }
    return {
      name: extractItemName(data, file),
      sequence: data.sequence,
      length: data.length,
      topology: data.topology || 'linear',
      organism: data.organism || '',
      description: data.description || '',
      annotations,
    };
  }

  // Text-based formats — parse on frontend
  const text = await file.text();

  let parsed;
  if (isGenBankFormat(text) || ['.gb', '.gbk', '.genbank'].includes(ext)) {
    parsed = parseGenBank(text);
    if (!parsed?.sequence) throw new Error('Could not parse GenBank file');
  } else if (isFasta(text) || ['.fasta', '.fa', '.fna'].includes(ext)) {
    parsed = parseFasta(text);
  } else {
    // Try GenBank first, then FASTA as fallback
    try {
      parsed = parseGenBank(text);
    } catch { /* ignore */ }
    if (!parsed?.sequence) {
      parsed = parseFasta(text);
    }
  }

  if (!parsed?.sequence) throw new Error('No sequence found in file');

  // Convert GenBank features to BodgeGene annotations
  let annotations = [];
  if (parsed.features?.length > 0) {
    const result = importFeatures(parsed.features, parsed.sequence.length, 'genbank');
    annotations = result.annotations || [];
  }

  // Enrichment: same pipeline as .dna files (homology naming + detail detection)
  if (parsed.sequence) {
    try {
      const { autoAnnotate, enrichWithCommonFeatures } = await import('./auto-annotate');

      if (annotations.length === 0) {
        // No features in file → full auto-annotation
        const base = autoAnnotate({
          name: parsed.name || 'imported',
          type: 'misc_feature',
          sequence: parsed.sequence,
        });
        annotations = await enrichWithCommonFeatures(parsed.sequence, base);
      } else {
        // Features exist → enrich with homology naming + detail detection
        annotations = await enrichWithCommonFeatures(parsed.sequence, annotations);
        for (const ann of annotations) {
          if (ann.knownFeature && ann.level === 'region') {
            ann.originalName = ann.name;
            ann.name = ann.knownFeature;
          }
        }
        // Detail-level enrichment (signal peptides, tags, domains, RE sites)
        const withDetails = autoAnnotate({
          name: parsed.name || 'imported',
          type: 'misc_feature',
          sequence: parsed.sequence,
          annotations,
        });
        const existingKeys = new Set(annotations.map(a => `${a.start}-${a.end}-${a.level}`));
        for (const ann of withDetails) {
          const key = `${ann.start}-${ann.end}-${ann.level}`;
          if (!existingKeys.has(key) && ann.level !== 'region') {
            annotations.push(ann);
          }
        }
      }
    } catch { /* enrichment not available */ }
  }

  return {
    name: extractItemName(parsed, file),
    sequence: parsed.sequence,
    length: parsed.length || parsed.sequence.length,
    topology: parsed.topology || 'linear',
    organism: parsed.organism || '',
    description: parsed.description || '',
    annotations,
  };
}

/**
 * Sequentially parse multiple files into ParsedItem[]. Ordering matches input.
 * Errors on individual files are surfaced as `{ _fileName, _error }` entries
 * so callers can display per-file failures without aborting the batch.
 *
 * @param {File[]} files
 * @returns {Promise<Array<Object>>}
 */
export async function handleFilesImport(files) {
  const results = [];
  for (const f of files || []) {
    try {
      const data = await handleFileImport(f);
      results.push({ ...data, _fileName: f.name });
    } catch (err) {
      results.push({ _fileName: f.name, _error: err.message || String(err), sequence: '', length: 0, annotations: [], topology: 'linear', name: f.name });
    }
  }
  return results;
}
