/**
 * starter-set — 4 synthetic reference vectors for the «Базовый набор» CTA.
 *
 * Sequences are short synthetic stand-ins (biologically plausible motifs,
 * NOT for wet-lab use). Purpose: populate Коллекция so biolog sees realistic
 * tree rows immediately after first launch.
 */
import { v7 as uuidv7 } from 'uuid';

function repeat(s, n) { return new Array(n).fill(s).join(''); }

const SEQ_PUC19 =
  'ATGAGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCTGTTTTTGCTCAC' +
  'CCAGAAACGCTGGTGAAAGTAAAAGATGCTGAAGATCAGTTGGGTGCACGAGTGGGTTACATCGAACTGGAT' +
  'CTCAACAGCGGTAAGATCCTTGAGAGTTTTCGCCCCGAAGAACGTTTTCCAATGATGAGCACTTTTAAAGTT' +
  'CTGCTATGTGGCGCGGTATTATCCCGTATTGACGCCGGGCAAGAGCAACTCGGTCGCCGCATACACTATTCT' +
  'CAGAATGACTTGGTTGAGTACTCACCAGTCACAGAAAAGCATCTTACGGATGGCATGACAGTAAGAGAATTA' +
  'TGCAGTGCTGCCATAACCATGAGTGATAACACTGCGGCCAACTTACTTCTGACAACGATCGGAGGACCGAAG';

const SEQ_PET28B =
  'ATG' +
  repeat('CATATGAAGCTTTAATACGACTCACTATAGGGGAATTGTGAGCGGATAACAATTCCCCTCTAGAAATAAT', 1) +
  repeat('TTTGTTTAACTTTAAGAAGGAGATATACCATGGGCAGCAGCCATCATCATCATCATCACAGCAGCGGCCTG', 1) +
  repeat('GTGCCGCGCGGCAGCCATATGCACCACCACCACCACCACCACCACCACGACTACAAAGACCATGACGGTGA', 1) +
  repeat('TACAAAATCTGTATTTCAGGGCATGGGCAGCAGCCATCACCATCATCACTAAAGTTAACTTTAGAAGAGAT', 1) +
  repeat('ACGATCAGCAGCGGCCTGGTGCCGCGCGGCAGCCATATGCACCACCACCACCACCACCAACTGGTCCATGG', 1) +
  'TAA';

const SEQ_PGEX =
  'ATG' +
  repeat('TCCCCTATACTAGGTTATTGGAAAATTAAGGGCCTTGTGCAACCCACTCGACTTCTTTTGGAATATCTTGA', 1) +
  repeat('AGAAAAATATGAAGAGCATTTGTATGAGCGCGATGAAGGTGATAAATGGCGAAACAAAAAGTTTGAATTGG', 1) +
  repeat('GTTTGGAGTTTCCCAATCTTCCTTATTATATTGATGGTGATGTTAAATTAACACAGTCTATGGCCATCATC', 1) +
  repeat('GCTGGTGGTAGCACGGAGCTGGCCATCAACGACAAATTCCTGAAATACCAGAAACTGGAAGACAAAGAAGAG', 1) +
  repeat('ATTGATGAATTTGAGCTTGGCGAAGATAATCCAAATAAACTGGAGCAGATGGAAGATGGAATGGACGATTTT', 1) +
  'TAA';

const SEQ_PBLUESCRIPT =
  repeat('ATGCCTGCAGGTCGACGGTACCGCGGGCCCGGGATCCACTAGTAACGGCCGCCAGTGTGCTGGAATTCGCC', 1) +
  repeat('CTTAATACGACTCACTATAGGGGAATTGTGAGCGGATAACAATTCCCCTCTAGAAATAATTTTGTTTAACTT', 1) +
  repeat('TAAGAAGGAGATATACCATGGGCAGCAGCCATCATCATCATCATCACAGCAGCGGCCTGGTGCCGCGCGGCA', 1) +
  repeat('GCCATATGGCTAGCATGACTGGTGGACAGCAAATGGGTCGGGATCCGAATTCGAGCTCCGTCGACAAGCTTG', 1) +
  repeat('CGGCCGCACTCGAGCACCACCACCACCACCACTGAGATCCGGCTGCTAACAAAGCCCGAAAGGAAGCTGAGT', 1);

function makeEntry({ id, name, tags, topology, sequence, annotations, description }) {
  return {
    id: id || uuidv7(),
    kind: 'container',
    name,
    tags,
    folderPath: '',
    addedAt: new Date().toISOString(),
    projectId: null,
    origin: { kind: 'starter_set', sourceFileName: null, importedAt: new Date().toISOString() },
    version: 1,
    payload: {
      sequence,
      length: sequence.length,
      topology,
      ends: null,
      annotations: annotations || [],
      organism: 'E. coli',
      description,
      resourceHash: null,
    },
    ext: {},
  };
}

export function buildStarterSet() {
  return [
    makeEntry({
      name: 'pUC19',
      tags: ['bacterial', 'cloning', 'AmpR', 'high-copy'],
      topology: 'circular',
      sequence: SEQ_PUC19,
      description: 'Высококопийный клонирующий вектор для E. coli. AmpR.',
      annotations: [
        { id: 'puc-a1', start: 0, end: 200, type: 'CDS', name: 'AmpR', strand: 1, level: 'region' },
        { id: 'puc-a2', start: 220, end: 260, type: 'promoter', name: 'lac promoter', strand: 1, level: 'region' },
        { id: 'puc-a3', start: 300, end: 380, type: 'misc_feature', name: 'MCS', strand: 1, level: 'region' },
      ],
    }),
    makeEntry({
      name: 'pET-28b(+)',
      tags: ['expression', 'His-tag', 'T7', 'KanR'],
      topology: 'circular',
      sequence: SEQ_PET28B,
      description: 'Экспрессионный вектор с T7-промотором и 6×His-тегом. KanR.',
      annotations: [
        { id: 'pet-a1', start: 0, end: 70, type: 'promoter', name: 'T7 promoter', strand: 1, level: 'region' },
        { id: 'pet-a2', start: 140, end: 210, type: 'misc_feature', name: '6×His-tag', strand: 1, level: 'detail' },
        { id: 'pet-a3', start: 210, end: SEQ_PET28B.length, type: 'CDS', name: 'KanR', strand: 1, level: 'region' },
      ],
    }),
    makeEntry({
      name: 'pGEX-4T-1',
      tags: ['expression', 'GST-tag', 'AmpR', 'fusion'],
      topology: 'circular',
      sequence: SEQ_PGEX,
      description: 'GST-фьюжн экспрессионный вектор для очистки белков. AmpR.',
      annotations: [
        { id: 'pgex-a1', start: 0, end: SEQ_PGEX.length - 3, type: 'CDS', name: 'GST', strand: 1, level: 'region' },
      ],
    }),
    makeEntry({
      name: 'pBluescript SK(+)',
      tags: ['cloning', 'lacZ', 'AmpR', 'sequencing'],
      topology: 'circular',
      sequence: SEQ_PBLUESCRIPT,
      description: 'Фагмидный вектор для клонирования и секвенирования. AmpR, lacZ-MCS.',
      annotations: [
        { id: 'pbs-a1', start: 0, end: 70, type: 'misc_feature', name: 'MCS', strand: 1, level: 'region' },
        { id: 'pbs-a2', start: 70, end: 140, type: 'promoter', name: 'T7 promoter', strand: 1, level: 'region' },
        { id: 'pbs-a3', start: 140, end: 210, type: 'promoter', name: 'T3 promoter', strand: -1, level: 'region' },
      ],
    }),
  ];
}
