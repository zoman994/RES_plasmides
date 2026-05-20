/**
 * K13 — SnapGene / ApE / Geneious / NCBI / pLannotate round-trip suite.
 *
 * This is the integration-level companion to the K0 unit tests on the
 * loss-detect module. Each describe-block exercises one third-party
 * round-trip pattern against the simulator helpers + a fixture.
 *
 * Real SnapGene/ApE/Geneious/NCBI/pLannotate round-trips require
 * humans with installed tools and are tracked in K14 manual smoke plan.
 * The simulators reproduce each tool's documented worst-case reformatter
 * so the decode chain is covered without the dependency.
 *
 * Spec §14 fixtures layout:
 *   __tests__/interop/fixtures/
 *     snapgene-export/pET-28b-bodge.gb   (K0 baseline)
 *     ape-export/...      (simulator-driven for now)
 *     ncbi-canonical/...  (simulator-driven for now)
 *     geneious-export/... (simulator-driven for now)
 *     plannotate-output/... (simulator strips COMMENT)
 *
 * Per spec §14.3, the table §6.4 loss matrix is filled in by K0 +
 * documented for K14 human verification. The tests here ASSERT the
 * worst-case decode survives — if a real tool's reformatter is
 * harsher than our simulator, this suite still catches it once a real
 * .gb fixture lands.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  writeContainerToGenBank,
  readContainerFromGenBank,
} from '../../lib/bodge-container-genbank';
import {
  decodeProvenanceComment,
  simulateThirdPartyRoundTrip,
  compareGenBankRoundTrip,
  parseLightGenBank,
} from '../../lib/bodge-snapgene-loss-detect';
import {
  migrateBodgeV1toV2,
} from '../../lib/bodge-migrations/v1-to-v2';
import { readBodge } from '../../lib/bodge-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = resolve(__dirname, 'fixtures');
const SNAPGENE_DIR = resolve(FIXTURE_DIR, 'snapgene-export');
const BODGE_V1_DIR = resolve(FIXTURE_DIR, 'bodge-v1');

function loadGb(dir, name) {
  return readFileSync(resolve(dir, name), 'utf8');
}

const SAMPLE_CONTAINER = {
  id: 'c01XYZABCDEF',
  name: 'pET-28b',
  description: 'Expression vector with His-tag, KanR selection.',
  sequence: 'ATGCATATGAAGCTTTAATACGACTCACTATAGGGGAATTGTGAGCGGATAACAATTCCC',
  topology: 'circular',
  annotations: [
    { id: '01ABCDEF', name: 'T7 promoter', type: 'promoter', start: 16, end: 51, strand: 1, color: '#E8A85F' },
    { id: '01DEFGHI', name: '6xHis-tag', type: 'CDS', start: 30, end: 51, strand: 1, color: '#D4C8A0', parentId: '01ABCDEF', level: 'detail' },
    { id: '01PRMR01', name: 'T7-rev', type: 'primer_bind', start: 5, end: 25, strand: -1, sequence: 'ATACAAAATCTGTATTTCAGGGCATGGGCAGCAGC' },
  ],
  provenance: {
    baseSnapshotHash: 'sha256-aaa',
    currentHash: 'sha256-zzz',
    topology: 'circular',
    origin: { kind: 'imported', source: 'addgene-13522' },
    commits: [{ id: '01CMT01', parent: null, kind: 'import_baseline' }],
  },
};

describe('K13 — sequence bit-perfect through .gb round-trip', () => {
  it('preserves sequence verbatim through BodgeGene round-trip', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    expect(back.sequence.toUpperCase()).toBe(SAMPLE_CONTAINER.sequence);
  });

  it('preserves sequence through SnapGene-style reformatter', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'snapgene');
    const back = readContainerFromGenBank(reformatted);
    expect(back.sequence.toUpperCase()).toBe(SAMPLE_CONTAINER.sequence);
  });

  it('preserves sequence through ApE / Geneious / NCBI reformats', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    for (const tool of ['ape', 'geneious', 'ncbi']) {
      const back = readContainerFromGenBank(simulateThirdPartyRoundTrip(gb, tool));
      expect(back.sequence.toUpperCase()).toBe(SAMPLE_CONTAINER.sequence);
    }
  });
});

describe('K13 — FEATURES + qualifiers preservation', () => {
  it('preserves /label /color through SnapGene reformat', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(simulateThirdPartyRoundTrip(gb, 'snapgene'));
    const t7 = back.annotations.find(a => a.name === 'T7 promoter');
    expect(t7).toBeTruthy();
    expect(t7.color).toBe('#E8A85F');
  });

  it('preserves /bodge_id qualifiers through SnapGene round-trip', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(simulateThirdPartyRoundTrip(gb, 'snapgene'));
    const t7 = back.annotations.find(a => a.id === '01ABCDEF');
    expect(t7).toBeTruthy();
  });

  it('preserves /parent_feature for sub-features', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(simulateThirdPartyRoundTrip(gb, 'snapgene'));
    const his = back.annotations.find(a => a.name === '6xHis-tag');
    expect(his?.parentId).toBe('01ABCDEF');
  });

  it('re-detects sub-features via /label fallback when /bodge_id stripped', () => {
    // Simulate a hostile reformatter that strips /bodge_id qualifiers
    // (some older SnapGene versions may do this).
    let gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    gb = gb.replace(/\/bodge_id="[^"]+"\n */g, '');
    const back = readContainerFromGenBank(gb);
    // Labels still present, IDs are now derived.
    expect(back.annotations.find(a => a.name === 'T7 promoter')).toBeTruthy();
    expect(back.annotations.every(a => a.id.startsWith('derived-'))).toBe(true);
  });
});

describe('K13 — COMMENT provenance verbatim OR multi-line reassembly', () => {
  it('SnapGene: COMMENT preserved bit-perfect when wrapping is within K0 budget', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'snapgene');
    const cmp = compareGenBankRoundTrip(gb, reformatted);
    expect(cmp.provenancePreserved).toBe(true);
    expect(cmp.provenancePayloadMatch).toBe(true);
  });

  it('ApE: multi-line reassembly engages and payload still matches', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'ape');
    const prov = decodeProvenanceComment(reformatted);
    expect(prov.payload).toBeTruthy();
    expect(prov.normalization).toContain('multi-line-reassembly');
  });

  it('pLannotate: COMMENT stripped → provenance loss flagged', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const stripped = simulateThirdPartyRoundTrip(gb, 'plannotate');
    const cmp = compareGenBankRoundTrip(gb, stripped);
    expect(cmp.sequenceMatch).toBe(true);
    expect(cmp.provenancePreserved).toBe(false);
    expect(cmp.losses).toContain('provenance-decode-failed');
  });
});

describe('K13 — external edit detection', () => {
  it('detects external sequence edit by hash mismatch', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    // Simulate a hostile editor changing the sequence.
    const edited = gb.replace(/^\s+1 atgcatatga/m, '        1 ttttttttta');
    const back = readContainerFromGenBank(edited);
    expect(back.sequence.toUpperCase()).not.toBe(SAMPLE_CONTAINER.sequence);
    // Provenance is still there with the OLD currentHash; caller compares.
    expect(back.provenance).toBeTruthy();
    expect(back.provenance.currentHash).toBe('sha256-zzz');
  });
});

describe('K13 — fixture pET-28b-bodge.gb parses', () => {
  it('parses the K0 fixture without throwing', () => {
    const gb = loadGb(SNAPGENE_DIR, 'pET-28b-bodge.gb');
    const back = readContainerFromGenBank(gb);
    expect(back.name).toContain('pET-28b');
    expect(back.annotations.length).toBeGreaterThan(0);
    const t7 = back.annotations.find(a => a.name === 'T7 promoter');
    expect(t7).toBeTruthy();
  });

  it('light parser extracts ≥3 features from fixture', () => {
    const gb = loadGb(SNAPGENE_DIR, 'pET-28b-bodge.gb');
    const parsed = parseLightGenBank(gb);
    expect(parsed.features.length).toBeGreaterThanOrEqual(3);
    expect(parsed.sequence.length).toBeGreaterThan(0);
  });
});

describe('K13 — v1 .bodge migration end-to-end (post-T3-revert / no-zones)', () => {
  it('v1-empty.bodge migrates to v2 + readBodge returns clean state', async () => {
    const buf = readFileSync(resolve(BODGE_V1_DIR, 'v1-empty.bodge'));
    const v2 = await migrateBodgeV1toV2(new Blob([buf]));
    const r = await readBodge(v2);
    expect(r.formatVersion).toBe('2.0.0');
    expect(r.state.containers).toEqual([]);
    expect(r.state.zones).toEqual([]);
    expect(v2._migrationLosses.some(l => l.kind === 'empty-project')).toBe(true);
  });

  it('v1-with-library.bodge migrates with library entries intact', async () => {
    const buf = readFileSync(resolve(BODGE_V1_DIR, 'v1-with-library.bodge'));
    const v2 = await migrateBodgeV1toV2(new Blob([buf]));
    const r = await readBodge(v2);
    expect(r.libraryEntries).toHaveLength(1);
    expect(r.libraryEntries[0].name).toBe('pUC19');
  });
});

describe('K13 — explicit loss-matrix entries per §6.4', () => {
  // §6.4 entries are TBD per human verification, but the simulator coverage
  // gives us a clean assertion baseline. Each entry below pairs a (tool,
  // expected-loss) tuple — if real-tool fixtures are added later the
  // simulator can be tightened to match observed harshness.
  const matrix = [
    { tool: 'snapgene', sequence: true, features: true, provenance: true },
    { tool: 'ape', sequence: true, features: true, provenance: true },
    { tool: 'ncbi', sequence: true, features: true, provenance: true },
    { tool: 'geneious', sequence: true, features: true, provenance: true },
    { tool: 'plannotate', sequence: true, features: true, provenance: false },
  ];

  for (const entry of matrix) {
    it(`§6.4: ${entry.tool} — sequence ${entry.sequence?'✓':'✗'} features ${entry.features?'✓':'✗'} provenance ${entry.provenance?'✓':'✗'}`, () => {
      const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
      const reformatted = simulateThirdPartyRoundTrip(gb, entry.tool);
      const cmp = compareGenBankRoundTrip(gb, reformatted);
      expect(cmp.sequenceMatch).toBe(entry.sequence);
      expect(cmp.featuresPreserved).toBe(entry.features);
      expect(cmp.provenancePreserved).toBe(entry.provenance);
    });
  }
});
