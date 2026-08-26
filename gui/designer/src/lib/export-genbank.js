/**
 * export-genbank — single-entry .gb export + project-wide .zip bundle.
 *
 * Two entry points:
 *   • `downloadEntryAsGenbank(entry)` — triggers a single .gb download
 *     for a library entry (uses entry.payload.sequence/annotations/topology).
 *   • `downloadProjectAsZip(projectName, entries)` — bundles every
 *     entry as `<safeName>.gb` inside a `<projectName>.zip` via fflate.
 *
 * `entryToGenbank` is a pure string builder; tests hit it directly to
 * avoid touching DOM (Blob/URL.createObjectURL).
 */
import { zipSync, strToU8 } from 'fflate';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { getIntronsForRegion, getExonRanges } from '../intron-utils';
import {
  LOCATION_KINDS,
  makeLocation,
  getSegments,
  formatGenBankLocation,
} from './annotation-location';

// Region types whose location is written as join(exons) when they carry introns
// — so a spliced CDS/gene round-trips through GenBank instead of flattening.
const SPLICEABLE_TYPES = new Set(['CDS', 'gene', 'marker', 'reporter']);

const GENBANK_TYPE_MAP = {
  CDS: 'CDS', gene: 'gene', promoter: 'promoter', terminator: 'terminator',
  rep_origin: 'rep_origin', marker: 'CDS', reporter: 'CDS',
  signal_peptide: 'sig_peptide', propeptide: 'mat_peptide',
  tag: 'misc_feature', linker: 'misc_feature', T2A: 'misc_feature',
  intron: 'intron', enhancer: 'enhancer', '5UTR': "5'UTR", '3UTR': "3'UTR",
  RBS: 'RBS', polyA_signal: 'polyA_signal',
  start_codon: 'misc_feature', stop_codon: 'misc_feature',
  restriction_site: 'misc_feature', mutation: 'variation', variation: 'variation',
  primer_bind: 'primer_bind', gRNA: 'ncRNA', ncRNA: 'ncRNA', aptamer: 'ncRNA',
  domain: 'Region', binding: 'misc_binding',
  active_site: 'misc_feature', cleavage_site: 'misc_feature',
  NLS: 'misc_feature', MCS: 'misc_feature', spacer: 'misc_feature',
  misc_feature: 'misc_feature', core_promoter: 'misc_feature',
  regulatory: 'regulatory',
};

function safeFileName(name) {
  const base = String(name || 'entry').trim().replace(/[\\/:*?"<>|]+/g, '_');
  return base.length ? base : 'entry';
}

function readEntryPayload(entry) {
  const payload = entry?.payload || {};
  const sequence = payload.sequence || entry?.sequence || '';
  const annotations = payload.annotations || entry?.annotations || [];
  const topology = payload.topology || entry?.topology || 'linear';
  const name = entry?.name || entry?.id || 'entry';
  return { sequence: String(sequence), annotations, topology, name };
}

/** Build a GenBank-format string for a single library entry. Pure. */
export function entryToGenbank(entry) {
  const { sequence, annotations, topology, name } = readEntryPayload(entry);
  const seq = sequence;
  const topo = topology === 'circular' ? 'circular' : 'linear';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const locusName = safeFileName(name).slice(0, 16).padEnd(16);

  let gb = '';
  gb += `LOCUS       ${locusName} ${seq.length} bp    DNA     ${topo}   SYN ${date}\n`;
  gb += `DEFINITION  ${name} (BodgeGene library export)\n`;
  gb += `FEATURES             Location/Qualifiers\n`;

  for (const ann of annotations) {
    if (!ann) continue;
    // The canonical location is authoritative — a compound or origin-crossing
    // feature is written from its own segments, never rebuilt from a bounding
    // span. Only a scalar region whose introns imply exons is still expanded to
    // join(exons) here (that structure lives in detail annotations, not in the
    // parent's location).
    let source = ann;
    if (
      getSegments(ann).length === 1
      && ann.level === 'region'
      && SPLICEABLE_TYPES.has(ann.type)
    ) {
      const introns = getIntronsForRegion(annotations, ann);
      if (introns.length) {
        const exons = getExonRanges(ann.start, ann.end, introns);
        if (exons.length > 1) {
          source = {
            strand: ann.strand,
            location: makeLocation(
              LOCATION_KINDS.JOIN,
              exons.map((e) => ({ start: e.start, end: e.end })),
            ),
          };
        }
      }
    }
    const loc = formatGenBankLocation(source);
    if (!loc) continue;
    const gbType = GENBANK_TYPE_MAP[ann.type] || 'misc_feature';
    gb += `     ${gbType.padEnd(16)}${loc}\n`;
    gb += `                     /label="${ann.name || ann.type || 'feature'}"\n`;
    if (ann.level) gb += `                     /bodgegene_level="${ann.level}"\n`;
    if (ann.regionId) gb += `                     /bodgegene_regionId="${ann.regionId}"\n`;
    const color = ann.color || ANNOTATION_COLORS[ann.type];
    if (color) gb += `                     /ApEinfo_fwdcolor="${color}"\n`;
    // FEAT-QUALIFIERS — round-trip the preserved INSDC qualifiers (/gene /product
    // /note /EC_number /db_xref …) so provenance survives import→export. Array
    // values emit one line each; `pseudo` is a valueless flag; embedded quotes are
    // doubled per the GenBank convention.
    if (ann.qualifiers && typeof ann.qualifiers === 'object') {
      for (const [k, v] of Object.entries(ann.qualifiers)) {
        const vals = Array.isArray(v) ? v : [v];
        for (const one of vals) {
          if (one == null || one === '') continue;
          if (k === 'pseudo' && (one === true || one === 'true')) {
            gb += `                     /pseudo\n`;
          } else {
            gb += `                     /${k}="${String(one).replace(/"/g, '""')}"\n`;
          }
        }
      }
    }
  }

  gb += `ORIGIN\n`;
  const lower = seq.toLowerCase();
  for (let i = 0; i < lower.length; i += 60) {
    const lineNum = String(i + 1).padStart(9);
    const chunks = [];
    for (let j = 0; j < 60 && i + j < lower.length; j += 10) {
      chunks.push(lower.slice(i + j, i + j + 10));
    }
    gb += `${lineNum} ${chunks.join(' ')}\n`;
  }
  gb += `//\n`;
  return gb;
}

function downloadBlob(blob, filename) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a .gb download for a single library entry. */
export function downloadEntryAsGenbank(entry) {
  if (!entry) return false;
  const gb = entryToGenbank(entry);
  const fname = `${safeFileName(entry.name || entry.id)}.gb`;
  downloadBlob(new Blob([gb], { type: 'chemical/seq-na-genbank' }), fname);
  return true;
}

/**
 * Bundle multiple entries into one .zip.
 * Filenames are deduplicated with a `__N` suffix on collision.
 * Returns the file count actually written (skips entries with no sequence).
 */
export function buildProjectZipBytes(projectName, entries) {
  const files = {};
  const used = new Map(); // base name → next index
  let written = 0;
  for (const e of entries || []) {
    const { sequence } = readEntryPayload(e);
    if (!sequence) continue;
    const base = safeFileName(e.name || e.id);
    let candidate = `${base}.gb`;
    if (files[candidate]) {
      const n = (used.get(base) || 1) + 1;
      used.set(base, n);
      candidate = `${base}__${n}.gb`;
    } else {
      used.set(base, 1);
    }
    files[candidate] = strToU8(entryToGenbank(e));
    written++;
  }
  return { bytes: zipSync(files), written };
}

/** Trigger a .zip download bundling every entry's .gb. */
export function downloadProjectAsZip(projectName, entries) {
  const { bytes, written } = buildProjectZipBytes(projectName, entries);
  if (!written) return 0;
  const fname = `${safeFileName(projectName || 'project')}.zip`;
  downloadBlob(new Blob([bytes], { type: 'application/zip' }), fname);
  return written;
}
