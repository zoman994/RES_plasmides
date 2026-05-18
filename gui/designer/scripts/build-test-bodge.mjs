#!/usr/bin/env node
/**
 * build-test-bodge.mjs — генератор тестового self-contained .bodge.
 *
 * Создаёт `test.bodge` в корне репо с одним проектом «Demo (test bundle)»
 * и тремя library entries (плазмида + два фрагмента) с правдоподобными
 * последовательностями и аннотациями. Файл предназначен для проверки UX
 * Sidebar «Открыть .bodge…» — после загрузки в Library tree должен
 * появиться ProjectZone «📦 Demo (test bundle).bodge» с тремя строками.
 *
 *   $ node gui/designer/scripts/build-test-bodge.mjs
 *
 * Без аргументов. Перезаписывает существующий test.bodge.
 */
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FILE_FORMAT_VERSION = 1;
const SCHEMA_VERSION = 1;
const APP_VERSION = '0.6.0-dev';

// ── Sample sequences ──────────────────────────────────────────────────
//
// Это синтетические, но правдоподобные образцы (короткие повторы вокруг
// настоящих биологических мотивов). Не для in vitro работы — только для
// проверки рендеринга в Library + просмотрщике карты.

function repeat(s, n) { return new Array(n).fill(s).join(''); }

// pUC19-like circular ~600 bp — короче настоящего, но достаточно для
// демонстрации топологии circular в виджетах.
const PUC19_LIKE_SEQ =
  'ATGAGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCTGTTTTTGCTCAC' +
  'CCAGAAACGCTGGTGAAAGTAAAAGATGCTGAAGATCAGTTGGGTGCACGAGTGGGTTACATCGAACTGGAT' +
  'CTCAACAGCGGTAAGATCCTTGAGAGTTTTCGCCCCGAAGAACGTTTTCCAATGATGAGCACTTTTAAAGTT' +
  'CTGCTATGTGGCGCGGTATTATCCCGTATTGACGCCGGGCAAGAGCAACTCGGTCGCCGCATACACTATTCT' +
  'CAGAATGACTTGGTTGAGTACTCACCAGTCACAGAAAAGCATCTTACGGATGGCATGACAGTAAGAGAATTA' +
  'TGCAGTGCTGCCATAACCATGAGTGATAACACTGCGGCCAACTTACTTCTGACAACGATCGGAGGACCGAAG' +
  'GAGCTAACCGCTTTTTTGCACAACATGGGGGATCATGTAACTCGCCTTGATCGTTGGGAACCGGAGCTGAAT' +
  'GAAGCCATACCAAACGACGAGCGTGACACCACGATGCCAGCAGCAATGGCAACAACGTTGCGCAAACTATTA' +
  'ACTGGCGAACTACTTACTCTAGCTTCCCGGCAACAATTAATAGACTGGATGGAGGCGGATAAAGTTGCAGGA';

// GFP CDS-like linear 720 bp.
const GFP_LIKE_SEQ =
  'ATG' +
  repeat('GTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGC', 1) +
  repeat('CACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGC', 1) +
  repeat('ACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGC', 1) +
  repeat('CGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGC', 1) +
  repeat('ACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTG', 1) +
  repeat('AACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAAC', 1) +
  repeat('TACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGC', 1) +
  repeat('CACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCC', 1) +
  repeat('GTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGAT', 1) +
  repeat('CACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAG', 1) +
  'TAA';

// AmpR/bla CDS-like linear ~861 bp.
const AMPR_LIKE_SEQ =
  'ATG' +
  repeat('AGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCTGTTTTTGCTCACCCA', 1) +
  repeat('GAAACGCTGGTGAAAGTAAAAGATGCTGAAGATCAGTTGGGTGCACGAGTGGGTTACATCGAACTGGATCTC', 1) +
  repeat('AACAGCGGTAAGATCCTTGAGAGTTTTCGCCCCGAAGAACGTTTTCCAATGATGAGCACTTTTAAAGTTCTG', 1) +
  repeat('CTATGTGGCGCGGTATTATCCCGTATTGACGCCGGGCAAGAGCAACTCGGTCGCCGCATACACTATTCTCAG', 1) +
  repeat('AATGACTTGGTTGAGTACTCACCAGTCACAGAAAAGCATCTTACGGATGGCATGACAGTAAGAGAATTATGC', 1) +
  repeat('AGTGCTGCCATAACCATGAGTGATAACACTGCGGCCAACTTACTTCTGACAACGATCGGAGGACCGAAGGAG', 1) +
  repeat('CTAACCGCTTTTTTGCACAACATGGGGGATCATGTAACTCGCCTTGATCGTTGGGAACCGGAGCTGAATGAA', 1) +
  repeat('GCCATACCAAACGACGAGCGTGACACCACGATGCCAGCAGCAATGGCAACAACGTTGCGCAAACTATTAACT', 1) +
  repeat('GGCGAACTACTTACTCTAGCTTCCCGGCAACAATTAATAGACTGGATGGAGGCGGATAAAGTTGCAGGACCA', 1) +
  repeat('CTTCTGCGCTCGGCCCTTCCGGCTGGCTGGTTTATTGCTGATAAATCTGGAGCCGGTGAGCGTGGGTCTCGC', 1) +
  repeat('GGTATCATTGCAGCACTGGGGCCAGATGGTAAGCCCTCCCGTATCGTAGTTATCTACACGACGGGGAGTCAG', 1) +
  'TAA';

// ── Project + entries ─────────────────────────────────────────────────

const NOW = '2026-05-09T18:00:00Z';
const PROJECT_ID = '01900000-7000-7000-8000-d3007e57ed99';

const ENTRY_PUC19_ID = '01900000-7000-7100-8000-000000000001';
const ENTRY_GFP_ID = '01900000-7000-7100-8000-000000000002';
const ENTRY_AMPR_ID = '01900000-7000-7100-8000-000000000003';

const project = {
  id: PROJECT_ID,
  schemaVer: 1,
  name: 'Demo (test bundle)',
  description: 'Тестовая сборка из трёх плазмид — для проверки UX «Открыть .bodge…».',
  tags: ['demo', 'test-bundle'],
  createdAt: NOW,
  updatedAt: NOW,
  agent: { name: 'Test fixture', email: '' },
  containerIds: [ENTRY_PUC19_ID, ENTRY_GFP_ID, ENTRY_AMPR_ID],
  projectCommitIds: [],
  primerIds: [],
  settings: {},
  ext: {},
  dag: { positions: {}, edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
};

const libraryEntries = [
  {
    id: ENTRY_PUC19_ID,
    kind: 'container',
    name: 'pUC19-demo',
    tags: ['bacterial', 'cloning', 'high-copy'],
    folderPath: '',
    addedAt: NOW,
    origin: { kind: 'file_import', sourceFileName: 'pUC19-demo.gb', sourceFormat: 'gb', importedAt: NOW },
    version: 1,
    projectId: PROJECT_ID,
    payload: {
      sequence: PUC19_LIKE_SEQ,
      length: PUC19_LIKE_SEQ.length,
      topology: 'circular',
      ends: null,
      annotations: [
        { id: 'pu-anno-1', start: 0, end: 200, type: 'CDS', name: 'AmpR (fragment)', strand: 1, level: 'region' },
        { id: 'pu-anno-2', start: 220, end: 280, type: 'promoter', name: 'lac promoter', strand: 1, level: 'region' },
        { id: 'pu-anno-3', start: 300, end: 400, type: 'misc_feature', name: 'lacZα MCS', strand: 1, level: 'region' },
        { id: 'pu-anno-4', start: 450, end: 600, type: 'rep_origin', name: 'pUC ori', strand: 0, level: 'region' },
      ],
      organism: 'E. coli',
      description: 'Demo high-copy cloning vector (synthetic short variant).',
      resourceHash: null,
    },
    ext: {},
  },
  {
    id: ENTRY_GFP_ID,
    kind: 'container',
    name: 'GFP CDS',
    tags: ['fluorescent', 'reporter'],
    folderPath: '',
    addedAt: NOW,
    origin: { kind: 'file_import', sourceFileName: 'GFP-CDS.gb', sourceFormat: 'gb', importedAt: NOW },
    version: 1,
    projectId: PROJECT_ID,
    payload: {
      sequence: GFP_LIKE_SEQ,
      length: GFP_LIKE_SEQ.length,
      topology: 'linear',
      ends: null,
      annotations: [
        { id: 'gfp-anno-1', start: 0, end: GFP_LIKE_SEQ.length, type: 'CDS', name: 'GFP', strand: 1, level: 'region' },
        { id: 'gfp-anno-2', start: 0, end: 3, type: 'misc_feature', name: 'start codon ATG', strand: 1, level: 'point' },
        { id: 'gfp-anno-3', start: GFP_LIKE_SEQ.length - 3, end: GFP_LIKE_SEQ.length, type: 'misc_feature', name: 'stop TAA', strand: 1, level: 'point' },
      ],
      organism: 'Aequorea victoria',
      description: 'Green fluorescent protein coding sequence (demo).',
      resourceHash: null,
    },
    ext: {},
  },
  {
    id: ENTRY_AMPR_ID,
    kind: 'container',
    name: 'AmpR (β-lactamase)',
    tags: ['resistance', 'selection', 'bacterial'],
    folderPath: '',
    addedAt: NOW,
    origin: { kind: 'file_import', sourceFileName: 'AmpR.gb', sourceFormat: 'gb', importedAt: NOW },
    version: 1,
    projectId: PROJECT_ID,
    payload: {
      sequence: AMPR_LIKE_SEQ,
      length: AMPR_LIKE_SEQ.length,
      topology: 'linear',
      ends: null,
      annotations: [
        { id: 'amp-anno-1', start: 0, end: AMPR_LIKE_SEQ.length, type: 'CDS', name: 'bla', strand: 1, level: 'region' },
        { id: 'amp-anno-2', start: 0, end: 69, type: 'sig_peptide', name: 'signal peptide', strand: 1, level: 'detail' },
      ],
      organism: 'E. coli',
      description: 'Ampicillin resistance gene (demo).',
      resourceHash: null,
    },
    ext: {},
  },
];

// ── Build .bodge ──────────────────────────────────────────────────────

const manifest = {
  fileFormatVersion: FILE_FORMAT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  appVersion: APP_VERSION,
  createdAt: project.createdAt,
  updatedAt: NOW,
};

const files = {
  'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  'project.json': strToU8(JSON.stringify(project, null, 2)),
  'library/entries.json': strToU8(JSON.stringify(libraryEntries, null, 2)),
};

const zipped = zipSync(files);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', '..', '..', 'test.bodge');
writeFileSync(outPath, zipped);

const totalSeqBytes = libraryEntries.reduce((acc, e) => acc + (e.payload?.sequence?.length || 0), 0);
console.log(`✓ wrote ${outPath} (${zipped.length} bytes)`);
console.log(`  manifest.json     ${files['manifest.json'].length} bytes`);
console.log(`  project.json      ${files['project.json'].length} bytes (project «${project.name}», ${project.tags.length} тег(ов))`);
console.log(`  library/entries   ${files['library/entries.json'].length} bytes (${libraryEntries.length} entries, ${totalSeqBytes} nt sequence)`);
