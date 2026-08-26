/**
 * Sprint M-B.1 K1 — file-import.js refactor.
 *
 * Verifies the parseFile (sync) / enrichAnnotations (async, single
 * autoAnnotate flag) split. Back-compat for v0.5 ImportStartScreen via the
 * `handleFileImport` thin wrapper is exercised by lifecycle.integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../auto-annotate', () => ({
  autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
  enrichWithCommonFeatures: vi.fn(async (_seq, anns) => anns),
}));

import { parseFile, enrichAnnotations, handleFileImport, parseFasta } from '../file-import';
import { getSegments, locationLength } from '../lib/annotation-location';
import { autoAnnotate, enrichWithCommonFeatures } from '../auto-annotate';

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

// ANN-0A — the abbreviated fixture declares 2686 bp in LOCUS but supplies only
// 60 bases of ORIGIN. The CDS used to sit at 100..400, i.e. outside the
// sequence the parser actually produces; ingress now refuses to import a
// feature that points at bases which do not exist, so the span is brought
// inside the 60 real bases. The test's intent — GenBank features become
// annotations — is unchanged.
const PUC19_GB = `LOCUS       pUC19                   2686 bp ds-DNA     circular SYN 01-JAN-1980
FEATURES             Location/Qualifiers
     CDS             10..50
                     /label=AmpR
                     /note="bla"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
//
`;

const FASTA_TEXT = `>my_seq description here
ATGCATGCATGCATGC
ATGCATGC
`;

beforeEach(() => {
  autoAnnotate.mockClear();
  enrichWithCommonFeatures.mockClear();
});

describe('parseFile', () => {
  it('parses GenBank with features → annotations + _fromFileCount > 0', async () => {
    const file = fileFromText('pUC19.gb', PUC19_GB);
    const item = await parseFile(file);
    expect(item.name).toBe('pUC19');
    expect(item.sequence.length).toBeGreaterThan(0);
    expect(item.annotations.length).toBeGreaterThan(0);
    expect(item._fromFileCount).toBe(item.annotations.length);
    expect(enrichWithCommonFeatures).not.toHaveBeenCalled();
    expect(autoAnnotate).not.toHaveBeenCalled();
  });

  it('parses FASTA → empty annotations and _fromFileCount === 0', async () => {
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    const item = await parseFile(file);
    expect(item.name).toBe('my_seq');
    expect(item.sequence).toBe('ATGCATGCATGCATGCATGCATGC');
    expect(item.annotations).toEqual([]);
    expect(item._fromFileCount).toBe(0);
    expect(item.topology).toBe('linear');
  });

  it('parseFile does not call enrichment (synchronous parse step only)', async () => {
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    await parseFile(file);
    expect(enrichWithCommonFeatures).not.toHaveBeenCalled();
    expect(autoAnnotate).not.toHaveBeenCalled();
  });
});

describe('enrichAnnotations', () => {
  it('autoAnnotate=true → enrichWithCommonFeatures called', async () => {
    enrichWithCommonFeatures.mockResolvedValueOnce([
      { id: 'r1', name: 'Enriched', type: 'misc_feature', start: 0, end: 10, level: 'region' },
    ]);
    const item = {
      name: 'x', sequence: 'ATGCATGCATGC', annotations: [], _fromFileCount: 0,
    };
    const out = await enrichAnnotations(item, { autoAnnotate: true });
    expect(enrichWithCommonFeatures).toHaveBeenCalled();
    expect(out.annotations.length).toBeGreaterThan(0);
    expect(out._fromFileCount).toBe(0);
  });

  it('autoAnnotate=false → returns annotations unchanged, no enrichment', async () => {
    const fileFeats = [
      { id: 'f1', name: 'AmpR', type: 'CDS', start: 100, end: 400, level: 'region' },
    ];
    const item = {
      name: 'pUC19', sequence: 'ATGC'.repeat(500),
      annotations: fileFeats, _fromFileCount: 1,
    };
    const out = await enrichAnnotations(item, { autoAnnotate: false });
    expect(enrichWithCommonFeatures).not.toHaveBeenCalled();
    expect(autoAnnotate).not.toHaveBeenCalled();
    expect(out.annotations).toEqual(fileFeats);
  });

  it('default (no opts) treats autoAnnotate as true', async () => {
    const item = { name: 'x', sequence: 'ATGCATGC', annotations: [] };
    await enrichAnnotations(item);
    expect(enrichWithCommonFeatures).toHaveBeenCalled();
  });
});

describe('parseFasta — V103 header+sequence on one line', () => {
  it('rescues `>F1 ACGTACGTACGT` (one-line) → name F1, sequence ACGTACGTACGT', () => {
    const r = parseFasta('>F1 ACGTACGTACGT');
    expect(r.name).toBe('F1');
    expect(r.sequence).toBe('ACGTACGTACGT');
  });

  it('does NOT mis-rescue `>pUC19 cloning vector\\nGGGG` — prose header ignored, seq from line below', () => {
    const r = parseFasta('>pUC19 cloning vector\nGGGG');
    expect(r.name).toBe('pUC19');
    expect(r.sequence).toBe('GGGG');
  });

  it('header-only `>ACGT` (no remainder) → sequence stays empty (behaviour unchanged)', () => {
    const r = parseFasta('>ACGT');
    expect(r.name).toBe('ACGT');
    expect(r.sequence).toBe('');
  });

  it('IUPAC-only remainder is rescued too (sanitizeSequence keeps RYKM)', () => {
    const r = parseFasta('>amb RYKM');
    expect(r.name).toBe('amb');
    expect(r.sequence).toBe('RYKM');
  });

  it('regression — multi-line FASTA with prose description: rescue never triggers', () => {
    const r = parseFasta('>multi some description\nACGT\nTTTT');
    expect(r.name).toBe('multi');
    expect(r.sequence).toBe('ACGTTTTT');
  });

  it('parseFile of a synthetic one-line FASTA File does not throw and yields a sequence', async () => {
    const file = fileFromText('pasted.fasta', '>F1 ACGTACGT');
    const item = await parseFile(file);
    expect(item.sequence).toBe('ACGTACGT');
    expect(item.name).toBe('F1');
  });
});

describe('handleFileImport (back-compat wrapper for v0.5 ImportStartScreen)', () => {
  it('parses + enriches by default; strips internal _fromFileCount/_ext/_metadata', async () => {
    const file = fileFromText('pUC19.gb', PUC19_GB);
    const out = await handleFileImport(file);
    expect(out.name).toBe('pUC19');
    expect(out._fromFileCount).toBeUndefined();
    expect(out._ext).toBeUndefined();
    expect(out._metadata).toBeUndefined();
    expect(enrichWithCommonFeatures).toHaveBeenCalled();
  });

  it('autoAnnotate:false skips enrichment (regression with v0.5)', async () => {
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    const out = await handleFileImport(file, { autoAnnotate: false });
    expect(out.annotations).toEqual([]);
    expect(enrichWithCommonFeatures).not.toHaveBeenCalled();
    expect(autoAnnotate).not.toHaveBeenCalled();
  });
});

// ═══ ANN-0I — GenBank text that real vendors emit ═══
//
// Two lossy spots on the .gb path:
//   * a location wrapped across lines (NCBI wraps at column 80) was read from
//     the FIRST line only, so `join(1..10,\n 50..60)` silently became `1..10`;
//   * repeated qualifiers overwrote each other, so a feature carrying three
//     /db_xref lines kept only the last.

const MULTILINE_GB = `LOCUS       WRAPTEST                 600 bp    DNA     linear   SYN 02-AUG-2026
DEFINITION  multiline location fixture
FEATURES             Location/Qualifiers
     CDS             join(101..150,201..250,
                     301..350,401..450)
                     /label="spliced"
                     /note="first note"
                     /note="second note"
                     /db_xref="GO:0004339"
                     /db_xref="EC:3.2.1.3"
                     /pseudo
ORIGIN
${Array.from({ length: 10 }, (_, i) =>
    `${String(i * 60 + 1).padStart(9)} ${'acgtacgtac'.repeat(6).match(/.{1,10}/g).join(' ')}`).join('\n')}
//
`;

const ORDER_GB = MULTILINE_GB
  .replace('join(101..150,201..250,', 'order(101..150,201..250,');

describe('ANN-0I — GenBank multiline locations', () => {
  it('accumulates a location wrapped across lines before parsing it', async () => {
    const out = await parseFile(fileFromText('wrap.gb', MULTILINE_GB));
    const cds = out.annotations.find((a) => a.name === 'spliced');
    expect(cds).toBeTruthy();
    expect(getSegments(cds)).toEqual([
      { start: 100, end: 150 },
      { start: 200, end: 250 },
      { start: 300, end: 350 },
      { start: 400, end: 450 },
    ]);
    // 4 exons of 50 bp — not the 50 bp the first line alone would have given
    expect(locationLength(cds)).toBe(200);
  });

  it('keeps order() across the same line wrap', async () => {
    const out = await parseFile(fileFromText('wrap.gb', ORDER_GB));
    const cds = out.annotations.find((a) => a.name === 'spliced');
    expect(cds.location.kind).toBe('order');
    expect(getSegments(cds)).toHaveLength(4);
  });
});

describe('ANN-0I — repeated GenBank qualifiers', () => {
  it('keeps every repeated value in source order instead of overwriting', async () => {
    const out = await parseFile(fileFromText('wrap.gb', MULTILINE_GB));
    const cds = out.annotations.find((a) => a.name === 'spliced');
    expect(cds.qualifiers.note).toEqual(['first note', 'second note']);
    expect(cds.qualifiers.db_xref).toEqual(['GO:0004339', 'EC:3.2.1.3']);
  });

  it('keeps a valueless qualifier as a boolean flag', async () => {
    const out = await parseFile(fileFromText('wrap.gb', MULTILINE_GB));
    const cds = out.annotations.find((a) => a.name === 'spliced');
    expect(cds.qualifiers.pseudo).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ANN-0K Block 1 — provenance through the REAL enrichAnnotations layer.
//
// The lower layer (auto-annotate.enrichWithCommonFeatures) already does two
// things on a homology hit, verified in its source:
//     existing.originalName = existing.name;   // the TRUE original
//     existing.name = featureRegionName(...);  // the canonical name
//
// `enrichAnnotations` then ran its own rename on top and captured
// `ann.name` — which by that point is ALREADY the canonical name. So the
// biologist's own label was overwritten by the recognised one and became
// unrecoverable. The mock below reproduces exactly that documented lower-layer
// behaviour; the layer under test is the real `enrichAnnotations`.
// ═══════════════════════════════════════════════════════════════════════════

describe('ANN-0K/1 — the imported name survives recognition', () => {
  const CANONICAL = 'J23100_promoter';

  function importedRegion() {
    return {
      id: 'r1',
      name: 'my_own_label',
      type: 'promoter',
      start: 0,
      end: 60,
      strand: 1,
      level: 'region',
      source: 'import',
    };
  }

  /** Faithful stand-in for the lower layer on a confident hit. */
  function lowerLayerRenames() {
    enrichWithCommonFeatures.mockImplementation(async (_seq, anns) => anns.map((a) => ({
      ...a,
      knownFeature: CANONICAL,
      detector: 'common_db',
      identity: 1,
      originalName: a.name,          // lower layer keeps the true original
      name: CANONICAL,               // …and renames
    })));
  }

  beforeEach(() => {
    autoAnnotate.mockImplementation(({ annotations = [] }) => annotations);
    lowerLayerRenames();
  });

  it('premise: the lower layer really does rename and record the original', async () => {
    const [out] = await enrichWithCommonFeatures('ACGT', [importedRegion()]);
    expect(out.name).toBe(CANONICAL);
    expect(out.originalName).toBe('my_own_label');
  });

  it('keeps name=canonical, source=import and the original label', async () => {
    const item = {
      name: 'p', sequence: 'ACGT'.repeat(15), length: 60,
      topology: 'linear', annotations: [importedRegion()],
    };
    const out = await enrichAnnotations(item, { autoAnnotate: true });
    const ann = out.annotations.find((a) => a.knownFeature === CANONICAL);

    expect(ann.name).toBe(CANONICAL);
    expect(ann.source).toBe('import');
    expect(ann.importedName).toBe('my_own_label');
    expect(ann.originalName).toBe('my_own_label');
  });

  it('a SECOND enrichment pass does not overwrite the original label', async () => {
    const item = {
      name: 'p', sequence: 'ACGT'.repeat(15), length: 60,
      topology: 'linear', annotations: [importedRegion()],
    };
    const once = await enrichAnnotations(item, { autoAnnotate: true });
    const twice = await enrichAnnotations(once, { autoAnnotate: true });
    const ann = twice.annotations.find((a) => a.knownFeature === CANONICAL);

    expect(ann.importedName).toBe('my_own_label');
    expect(ann.originalName).toBe('my_own_label');
    expect(ann.name).toBe(CANONICAL);
  });

  it('recognition data is still attached', async () => {
    const item = {
      name: 'p', sequence: 'ACGT'.repeat(15), length: 60,
      topology: 'linear', annotations: [importedRegion()],
    };
    const out = await enrichAnnotations(item, { autoAnnotate: true });
    const ann = out.annotations.find((a) => a.knownFeature === CANONICAL);
    expect(ann.detector).toBe('common_db');
  });
});
