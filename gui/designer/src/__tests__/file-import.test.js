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
import { autoAnnotate, enrichWithCommonFeatures } from '../auto-annotate';

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

const PUC19_GB = `LOCUS       pUC19                   2686 bp ds-DNA     circular SYN 01-JAN-1980
FEATURES             Location/Qualifiers
     CDS             100..400
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
