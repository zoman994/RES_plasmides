/**
 * bodge-container-genbank — container ↔ GenBank serialization.
 *
 * writeContainerToGenBank(container) → string
 * readContainerFromGenBank(string)   → container
 *
 * The string output is a valid GenBank file: LOCUS / DEFINITION /
 * ACCESSION / VERSION / KEYWORDS / SOURCE / FEATURES / ORIGIN, terminated
 * by `//`. A BodgeGene-specific COMMENT block carries provenance payload
 * (containerId + commits[] + hash + origin) via base64-encoded JSON
 * wrapped in the K0 markers so SnapGene/ApE/Geneious round-trips never
 * lose the payload (multi-line reassembly handled by K0 decoder).
 *
 * Custom GenBank qualifiers we emit + read:
 *   /label="..."          standard
 *   /bodge_id="01XYZ"     stable feature UUID — preserves identity through
 *                         re-import after third-party edit.
 *   /parent_feature="..." sub-feature → parent reference (level: 'detail').
 *   /color="#E8A85F"      hex feature color.
 *   /note="sequence:..."  on `primer_bind` features only — SnapGene-symmetric
 *                         primer round-trip.
 */
import {
  encodeProvenanceComment,
  formatCommentBlock,
  decodeProvenanceComment,
} from './bodge-snapgene-loss-detect';

const GENBANK_TYPE_MAP = {
  CDS: 'CDS',
  gene: 'gene',
  promoter: 'promoter',
  terminator: 'terminator',
  rep_origin: 'rep_origin',
  marker: 'CDS',
  reporter: 'CDS',
  signal_peptide: 'sig_peptide',
  propeptide: 'mat_peptide',
  tag: 'misc_feature',
  linker: 'misc_feature',
  T2A: 'misc_feature',
  intron: 'intron',
  enhancer: 'enhancer',
  '5UTR': "5'UTR",
  '3UTR': "3'UTR",
  RBS: 'RBS',
  polyA_signal: 'polyA_signal',
  start_codon: 'misc_feature',
  stop_codon: 'misc_feature',
  restriction_site: 'misc_feature',
  mutation: 'variation',
  variation: 'variation',
  primer_bind: 'primer_bind',
  gRNA: 'ncRNA',
  ncRNA: 'ncRNA',
  aptamer: 'ncRNA',
  domain: 'Region',
  binding: 'misc_binding',
  active_site: 'misc_feature',
  cleavage_site: 'misc_feature',
  NLS: 'misc_feature',
  MCS: 'misc_feature',
  spacer: 'misc_feature',
  misc_feature: 'misc_feature',
  core_promoter: 'misc_feature',
  regulatory: 'regulatory',
};

const REVERSE_TYPE_MAP = {
  CDS: 'CDS',
  gene: 'gene',
  promoter: 'promoter',
  terminator: 'terminator',
  rep_origin: 'rep_origin',
  sig_peptide: 'signal_peptide',
  mat_peptide: 'propeptide',
  intron: 'intron',
  enhancer: 'enhancer',
  "5'UTR": '5UTR',
  "3'UTR": '3UTR',
  RBS: 'RBS',
  polyA_signal: 'polyA_signal',
  variation: 'variation',
  primer_bind: 'primer_bind',
  ncRNA: 'ncRNA',
  Region: 'domain',
  misc_binding: 'binding',
  misc_feature: 'misc_feature',
  regulatory: 'regulatory',
};

function safeLocusName(name) {
  if (!name) return 'unknown';
  const base = String(name).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 16);
  return base.padEnd(16);
}

function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return formatDate(null);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = months[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatLocation(start, end, strand) {
  // Convert 0-based inclusive-exclusive [start,end) to 1-based inclusive.
  const s = start + 1;
  const e = end;
  return strand === -1 ? `complement(${s}..${e})` : `${s}..${e}`;
}

function parseLocation(loc) {
  if (!loc) return null;
  const m = /^(complement\()?(\d+)\.\.(\d+)\)?$/.exec(loc.trim());
  if (!m) return null;
  return {
    start: parseInt(m[2], 10) - 1,
    end: parseInt(m[3], 10),
    strand: m[1] ? -1 : 1,
  };
}

function escapeQualifier(v) {
  return String(v).replace(/"/g, '""');
}

function formatQualifier(key, value, indent = 21) {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined || value === '') return `${pad}/${key}`;
  return `${pad}/${key}="${escapeQualifier(value)}"`;
}

/**
 * Serialize a BodgeGene container object to GenBank string.
 *
 * Container shape (input):
 * {
 *   id: "c01XYZ",
 *   name: "pET-28b",
 *   description: "...",
 *   sequence: "ATGCATG...",
 *   topology: "circular" | "linear",
 *   annotations: [
 *     {
 *       id, name, type, start, end, strand,
 *       color?, parentId?, level?,
 *       sequence?  // for primer_bind features (DEC-LIB-08)
 *     }
 *   ],
 *   provenance: {                   // optional — emits COMMENT block
 *     baseSnapshotHash, currentHash, origin, provenance, commits, ...
 *   }
 * }
 */
export function writeContainerToGenBank(container) {
  if (!container || typeof container !== 'object') {
    throw new Error('writeContainerToGenBank: container required');
  }
  const seq = String(container.sequence || '');
  const topology = container.topology === 'circular' ? 'circular' : 'linear';
  const updatedAt = container.updatedAt || container.createdAt;

  let out = '';
  out += `LOCUS       ${safeLocusName(container.name)} ${seq.length} bp DNA     ${topology} SYN ${formatDate(updatedAt)}\n`;
  out += `DEFINITION  ${container.description || container.name || 'BodgeGene container'}\n`;
  if (container.id) {
    out += `ACCESSION   ${container.id}\n`;
    out += `VERSION     ${container.id}.${container.version || 1}\n`;
  }
  if (Array.isArray(container.keywords) && container.keywords.length) {
    out += `KEYWORDS    ${container.keywords.join('; ')}.\n`;
  } else {
    out += `KEYWORDS    .\n`;
  }
  out += `SOURCE      synthetic DNA construct\n`;
  out += `  ORGANISM  synthetic DNA construct\n`;
  out += `FEATURES             Location/Qualifiers\n`;

  for (const ann of container.annotations || []) {
    if (!ann) continue;
    const start = Math.max(0, Number(ann.start) || 0);
    const end = Math.max(start, Number(ann.end) || start);
    const strand = ann.strand === -1 ? -1 : 1;
    const gbType = GENBANK_TYPE_MAP[ann.type] || 'misc_feature';
    out += `     ${gbType.padEnd(16)}${formatLocation(start, end, strand)}\n`;
    out += `${formatQualifier('label', ann.name || ann.type || 'feature')}\n`;
    if (ann.id) out += `${formatQualifier('bodge_id', ann.id)}\n`;
    if (ann.parentId) out += `${formatQualifier('parent_feature', ann.parentId)}\n`;
    if (ann.color) out += `${formatQualifier('color', ann.color)}\n`;
    if (ann.type === 'primer_bind' && ann.sequence) {
      out += `${formatQualifier('note', `sequence:${ann.sequence}`)}\n`;
    } else if (ann.note) {
      out += `${formatQualifier('note', ann.note)}\n`;
    }
    if (ann.level && ann.level !== 'region') {
      out += `${formatQualifier('bodge_level', ann.level)}\n`;
    }
  }

  if (container.provenance) {
    const payload = {
      containerId: container.id,
      ...container.provenance,
    };
    const body = encodeProvenanceComment(payload);
    out += `${formatCommentBlock(body)}\n`;
  }

  out += `ORIGIN\n`;
  const lower = seq.toLowerCase();
  for (let i = 0; i < lower.length; i += 60) {
    const lineNum = String(i + 1).padStart(9);
    const chunks = [];
    for (let j = 0; j < 60 && i + j < lower.length; j += 10) {
      chunks.push(lower.slice(i + j, i + j + 10));
    }
    out += `${lineNum} ${chunks.join(' ')}\n`;
  }
  out += `//\n`;
  return out;
}

/**
 * Read a GenBank string into a BodgeGene container object.
 * Inverse of writeContainerToGenBank — including provenance COMMENT
 * decode via K0 reassembly.
 *
 * Best-effort tolerant of third-party-edited .gb files:
 *   - Missing /bodge_id qualifiers → annotations get fresh stable UUIDs
 *     derived from (start, end, type, label) so subsequent edits stay
 *     stable across re-import (caller can override via passed-in
 *     idResolver).
 *   - LOCUS line with non-standard whitespace.
 *   - CRLF / LF.
 *   - Multi-line qualifier values (continued by 21-space indent).
 */
export function readContainerFromGenBank(gbText, opts = {}) {
  if (!gbText || typeof gbText !== 'string') {
    throw new Error('readContainerFromGenBank: string required');
  }
  const lines = gbText.replace(/\r\n/g, '\n').split('\n');
  const container = {
    id: '',
    name: '',
    description: '',
    sequence: '',
    topology: 'linear',
    annotations: [],
    version: 1,
    keywords: [],
    provenance: null,
  };

  let i = 0;
  let inFeatures = false;
  let inOrigin = false;
  let currentFeature = null;
  let pendingQualifier = null;

  while (i < lines.length) {
    const line = lines[i];
    if (/^LOCUS\s/.test(line)) {
      const parts = line.split(/\s+/);
      // LOCUS  <name> <length> bp DNA <topology> SYN <date>
      container.name = parts[1] || '';
      const topoIdx = parts.findIndex(p => p === 'circular' || p === 'linear');
      if (topoIdx >= 0) container.topology = parts[topoIdx];
    } else if (/^DEFINITION\s/.test(line)) {
      container.description = line.replace(/^DEFINITION\s+/, '').trim();
    } else if (/^ACCESSION\s/.test(line)) {
      container.id = line.replace(/^ACCESSION\s+/, '').trim();
    } else if (/^VERSION\s/.test(line)) {
      const v = line.replace(/^VERSION\s+/, '').trim();
      const m = /\.(\d+)$/.exec(v);
      if (m) container.version = parseInt(m[1], 10);
    } else if (/^KEYWORDS\s/.test(line)) {
      const kw = line.replace(/^KEYWORDS\s+/, '').replace(/\.$/, '').trim();
      if (kw && kw !== '.') container.keywords = kw.split(/;\s*/).filter(Boolean);
    } else if (/^FEATURES\s/.test(line)) {
      inFeatures = true;
      inOrigin = false;
    } else if (/^ORIGIN(\s|$)/.test(line)) {
      if (currentFeature) {
        container.annotations.push(currentFeature);
        currentFeature = null;
      }
      inFeatures = false;
      inOrigin = true;
    } else if (/^\/\/(\s|$)/.test(line)) {
      break;
    } else if (inFeatures) {
      const featureMatch = line.match(/^ {5}(\S+)\s+(\S+.*)$/);
      const qualMatch = line.match(/^ {21}\/(\w+)(?:=(.*))?$/);
      if (featureMatch) {
        if (currentFeature) container.annotations.push(currentFeature);
        const loc = parseLocation(featureMatch[2]);
        if (loc) {
          currentFeature = {
            id: '',
            name: '',
            type: REVERSE_TYPE_MAP[featureMatch[1]] || featureMatch[1],
            start: loc.start,
            end: loc.end,
            strand: loc.strand,
          };
        } else {
          currentFeature = null;
        }
        pendingQualifier = null;
      } else if (qualMatch && currentFeature) {
        const key = qualMatch[1];
        let value = qualMatch[2] || '';
        if (value.startsWith('"')) {
          value = value.replace(/^"/, '');
          if (value.endsWith('"') && !value.endsWith('""')) {
            value = value.slice(0, -1);
            pendingQualifier = null;
          } else {
            pendingQualifier = { key, value };
          }
        } else {
          pendingQualifier = null;
        }
        applyQualifier(currentFeature, key, value);
      } else if (currentFeature && /^ {21}/.test(line) && pendingQualifier) {
        const cont = line.replace(/^ {21}/, '');
        const trimmed = cont.endsWith('"') ? cont.slice(0, -1) : cont;
        pendingQualifier.value += trimmed;
        applyQualifier(currentFeature, pendingQualifier.key, pendingQualifier.value);
        if (cont.endsWith('"')) pendingQualifier = null;
      }
    } else if (inOrigin) {
      const m = line.match(/^\s*\d+\s+(.+)$/);
      if (m) container.sequence += m[1].replace(/\s/g, '').toUpperCase();
    }
    i++;
  }

  // Stable-id derivation for annotations missing /bodge_id.
  for (const a of container.annotations) {
    if (!a.id) {
      a.id = opts.idResolver
        ? opts.idResolver(a)
        : `derived-${a.start}-${a.end}-${a.strand}-${a.type}`;
    }
    if (!a.name) a.name = a.type;
  }

  // Decode provenance COMMENT if present.
  const prov = decodeProvenanceComment(gbText);
  if (prov.payload) {
    container.provenance = prov.payload;
    if (!container.id && prov.payload.containerId) container.id = prov.payload.containerId;
  }

  return container;
}

function applyQualifier(feature, key, value) {
  switch (key) {
    case 'label':
      feature.name = value;
      break;
    case 'bodge_id':
      feature.id = value;
      break;
    case 'parent_feature':
      feature.parentId = value;
      break;
    case 'color':
      feature.color = value;
      break;
    case 'bodge_level':
      feature.level = value;
      break;
    case 'note':
      if (feature.type === 'primer_bind' && /^sequence:/.test(value)) {
        feature.sequence = value.replace(/^sequence:/, '');
      } else {
        feature.note = value;
      }
      break;
    default:
      // Preserve unknown qualifiers under a generic bag.
      if (!feature.unknownQualifiers) feature.unknownQualifiers = {};
      feature.unknownQualifiers[key] = value;
      break;
  }
}
