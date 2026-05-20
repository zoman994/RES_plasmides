/**
 * K0 — SnapGene COMMENT provenance round-trip + loss-detect.
 *
 * These tests simulate third-party tool reformatting behaviors (multi-line
 * wrap, indentation change, comment strip) and verify the decoder is
 * robust enough to recover the provenance payload bit-perfect.
 *
 * Real SnapGene / ApE / Geneious / NCBI / pLannotate round-trips require
 * a human in the loop — those are documented in K14 manual smoke test plan.
 * Here we simulate the worst-case reformatting patterns each tool is
 * known to apply (community reports + tool docs).
 */
import { describe, it, expect } from 'vitest';
import {
  encodeProvenanceComment,
  formatCommentBlock,
  extractCommentSection,
  decodeProvenanceComment,
  hasProvenanceMarkers,
  compareGenBankRoundTrip,
  parseLightGenBank,
  simulateThirdPartyRoundTrip,
  _internals,
} from '../bodge-snapgene-loss-detect';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PATH = resolve(
  __dirname,
  '..', '..', '__tests__', 'interop', 'fixtures', 'snapgene-export',
  'pET-28b-bodge.gb',
);

const SAMPLE_PAYLOAD = {
  containerId: 'c01FIXTURE01',
  baseSnapshotHash: 'sha256-aaa',
  currentHash: 'sha256-zzz',
  topology: 'circular',
  ends: null,
  origin: {
    kind: 'imported',
    source: 'addgene-13522',
    importedAt: '2026-04-01T10:30:00.000Z',
  },
  provenance: {
    projectId: 'p01XYZABCDEF',
    createdInVersion: '0.8.3-alpha',
    modifiedInVersion: '0.9.0-alpha',
  },
  commits: [
    {
      id: '01CMT01',
      parent: null,
      timestamp: '2026-04-01T10:30:00.000Z',
      author: 'Igor',
      kind: 'import_baseline',
      diff: null,
    },
  ],
  primersEmbedded: [
    {
      id: '01PRMR01',
      name: 'T7-rev',
      sequence: 'ATACAAAATCTGTATTTCAGGGCATGGGCAGCAGC',
    },
  ],
};

function injectCommentIntoFixture(gbText, commentBlock) {
  // Insert COMMENT block before FEATURES.
  return gbText.replace(/^FEATURES /m, `${commentBlock}\nFEATURES `);
}

describe('K0 — provenance encode → decode round-trip (in-memory)', () => {
  it('encodes a payload to a marker-bounded base64 block at 60-col wrap', () => {
    const body = encodeProvenanceComment(SAMPLE_PAYLOAD);
    expect(body).toContain(_internals.PROVENANCE_START);
    expect(body).toContain(_internals.PROVENANCE_END);
    expect(body).toContain('schema  :: container-provenance-v1');
    expect(body).toContain('format  :: base64-json');
    // Every line between START/END markers must be <= 60 chars so third-party
    // hard wrap (typically 79) never splits a payload chunk.
    const lines = body.split('\n');
    const startIdx = lines.indexOf(_internals.PROVENANCE_START);
    const endIdx = lines.indexOf(_internals.PROVENANCE_END);
    for (let i = startIdx + 1; i < endIdx; i++) {
      expect(lines[i].length).toBeLessThanOrEqual(60);
    }
  });

  it('decode recovers the exact payload after in-memory round-trip', () => {
    const body = encodeProvenanceComment(SAMPLE_PAYLOAD);
    const fmt = formatCommentBlock(body);
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    const gb = injectCommentIntoFixture(fixture, fmt);
    const result = decodeProvenanceComment(gb);
    expect(result.payload).toBeTruthy();
    expect(result.payload.containerId).toBe(SAMPLE_PAYLOAD.containerId);
    expect(result.payload.primersEmbedded[0].sequence)
      .toBe(SAMPLE_PAYLOAD.primersEmbedded[0].sequence);
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('returns null payload when no COMMENT section exists', () => {
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    const result = decodeProvenanceComment(fixture);
    expect(result.payload).toBeNull();
    expect(result.lossDetected).toContain('no-comment-section');
  });

  it('returns null payload when markers are missing from COMMENT', () => {
    const noMarkers = 'LOCUS  test 1 bp DNA linear SYN 19-MAY-2026\nCOMMENT     just a note, no provenance\nFEATURES             Location/Qualifiers\nORIGIN\n//\n';
    const result = decodeProvenanceComment(noMarkers);
    expect(result.payload).toBeNull();
    expect(result.lossDetected).toContain('markers-missing-or-out-of-order');
  });
});

describe('K0 — third-party reformat simulation', () => {
  const buildGbWithPayload = () => {
    const body = encodeProvenanceComment(SAMPLE_PAYLOAD);
    const fmt = formatCommentBlock(body);
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    return injectCommentIntoFixture(fixture, fmt);
  };

  it('survives SnapGene-style 79-char wrap with 12-space indent', () => {
    const original = buildGbWithPayload();
    const reformatted = simulateThirdPartyRoundTrip(original, 'snapgene');
    const result = decodeProvenanceComment(reformatted);
    expect(result.payload).toBeTruthy();
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('survives ApE-style 64-char wrap with 5-space indent', () => {
    const original = buildGbWithPayload();
    const reformatted = simulateThirdPartyRoundTrip(original, 'ape');
    const result = decodeProvenanceComment(reformatted);
    expect(result.payload).toBeTruthy();
    expect(result.normalization).toContain('multi-line-reassembly');
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('survives NCBI canonical reformat', () => {
    const original = buildGbWithPayload();
    const reformatted = simulateThirdPartyRoundTrip(original, 'ncbi');
    const result = decodeProvenanceComment(reformatted);
    expect(result.payload).toBeTruthy();
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('survives Geneious-style 12-space normalisation + blank-line drop', () => {
    const original = buildGbWithPayload();
    const reformatted = simulateThirdPartyRoundTrip(original, 'geneious');
    const result = decodeProvenanceComment(reformatted);
    expect(result.payload).toBeTruthy();
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('detects pLannotate-style COMMENT strip as loss', () => {
    const original = buildGbWithPayload();
    const reformatted = simulateThirdPartyRoundTrip(original, 'plannotate');
    const result = decodeProvenanceComment(reformatted);
    expect(result.payload).toBeNull();
    expect(result.lossDetected).toContain('no-comment-section');
  });

  it('survives CRLF line-ending swap', () => {
    const original = buildGbWithPayload();
    const crlf = original.replace(/\n/g, '\r\n');
    const result = decodeProvenanceComment(crlf);
    expect(result.payload).toBeTruthy();
    expect(JSON.stringify(result.payload)).toBe(JSON.stringify(SAMPLE_PAYLOAD));
  });

  it('compareGenBankRoundTrip reports preserved sequence + features + provenance', () => {
    const original = buildGbWithPayload();
    const snapgene = simulateThirdPartyRoundTrip(original, 'snapgene');
    const cmp = compareGenBankRoundTrip(original, snapgene);
    expect(cmp.sequenceMatch).toBe(true);
    expect(cmp.featuresPreserved).toBe(true);
    expect(cmp.provenancePreserved).toBe(true);
    expect(cmp.provenancePayloadMatch).toBe(true);
    expect(cmp.losses).toEqual([]);
  });

  it('compareGenBankRoundTrip flags pLannotate-style provenance loss', () => {
    const original = buildGbWithPayload();
    const plannotate = simulateThirdPartyRoundTrip(original, 'plannotate');
    const cmp = compareGenBankRoundTrip(original, plannotate);
    expect(cmp.sequenceMatch).toBe(true);
    expect(cmp.provenancePreserved).toBe(false);
    expect(cmp.losses).toContain('provenance-decode-failed');
  });
});

describe('K0 — light parser sanity', () => {
  it('parses the fixture: extracts sequence + features + qualifiers', () => {
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    const parsed = parseLightGenBank(fixture);
    expect(parsed.sequence.length).toBeGreaterThan(0);
    expect(parsed.features.length).toBeGreaterThanOrEqual(3);
    const promoter = parsed.features.find(f => f.qualifiers.label === 'T7 promoter');
    expect(promoter).toBeTruthy();
    expect(promoter.qualifiers.bodge_id).toBe('01ABCDEF');
    expect(promoter.qualifiers.color).toBe('#E8A85F');
  });

  it('hasProvenanceMarkers returns true only when both markers present', () => {
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    expect(hasProvenanceMarkers(fixture)).toBe(false);
    const withProv = injectCommentIntoFixture(
      fixture,
      formatCommentBlock(encodeProvenanceComment(SAMPLE_PAYLOAD)),
    );
    expect(hasProvenanceMarkers(withProv)).toBe(true);
  });

  it('extractCommentSection returns null on no-COMMENT file', () => {
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    expect(extractCommentSection(fixture)).toBeNull();
  });

  it('extractCommentSection handles multi-line COMMENT', () => {
    const gb = `LOCUS test 100 bp DNA linear SYN 19-MAY-2026
COMMENT     first line
            second line
            third line
FEATURES             Location/Qualifiers
ORIGIN
        1 a
//
`;
    const c = extractCommentSection(gb);
    expect(c).not.toBeNull();
    expect(c.split('\n')).toEqual(['first line', 'second line', 'third line']);
  });
});
