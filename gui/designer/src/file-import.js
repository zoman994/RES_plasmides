/**
 * Shared file import logic for GenBank, FASTA, and SnapGene .dna files.
 * Used by PartsPalette (file button) and App.jsx (OS drag-and-drop).
 */

import { parseGenBank, isGenBankFormat } from './genbank-parser';
import { importFeatures } from './import-annotations';

export const ACCEPT_STRING = '.gb,.gbk,.genbank,.dna,.fasta,.fa,.fna';

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
  const sequence = seqParts.join('').toUpperCase();
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
const API_BASE = 'http://localhost:8000';

/**
 * Import a .dna file via backend API (binary SnapGene format).
 * Falls back gracefully if backend is unavailable.
 */
async function importViaBacked(file) {
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
    const data = await importViaBacked(file);
    let annotations = [];
    if (data.features?.length > 0) {
      const result = importFeatures(data.features, data.length, 'genbank');
      annotations = result.annotations || [];
    }
    // Fallback: if backend returned 0 features, try common features detection
    if (annotations.length === 0 && data.sequence) {
      try {
        const { enrichWithCommonFeatures, autoAnnotate } = await import('./auto-annotate');
        const base = autoAnnotate({
          name: data.name || 'imported',
          type: 'misc_feature',
          sequence: data.sequence,
        });
        annotations = await enrichWithCommonFeatures(data.sequence, base);
      } catch { /* common features DB not available */ }
    }
    return {
      name: (data.name && !data.name.startsWith('<unknown'))
        ? data.name
        : file.name.replace(/\.[^.]+$/, ''),
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

  return {
    name: parsed.name || file.name.replace(/\.[^.]+$/, ''),
    sequence: parsed.sequence,
    length: parsed.length || parsed.sequence.length,
    topology: parsed.topology || 'linear',
    organism: parsed.organism || '',
    description: parsed.description || '',
    annotations,
  };
}
