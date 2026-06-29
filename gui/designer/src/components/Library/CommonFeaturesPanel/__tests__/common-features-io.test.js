import { describe, it, expect } from 'vitest';
import { serializeCommonFeatures, parseCommonFeatures } from '../common-features-io';

describe('common-features-io — serialize/parse (FEAT-CF-SHARE)', () => {
  const overlay = {
    userFeatures: {
      u1: { id: 'u1', kind: 'user', name: 'PglaA', type: 'promoter', sequence: 'ACGTACGT', createdAt: 'x' },
      u2: { id: 'u2', kind: 'user', name: 'CBHII signal', type: 'sig_peptide', protein: 'MRSLLL' },
    },
    overrides: {
      b1: { id: 'b1', kind: 'override', baseId: 'b1', name: 'AmpR (lab)', type: 'CDS', sequence: 'ATGAAA' },
    },
  };

  it('serializes the overlay to portable JSON (format/version + arrays, cruft dropped)', () => {
    const json = serializeCommonFeatures(overlay);
    const doc = JSON.parse(json);
    expect(doc.format).toBe('bodgegene-common-features');
    expect(doc.version).toBe(1);
    expect(doc.userFeatures).toHaveLength(2);
    expect(doc.overrides).toHaveLength(1);
    // portable fields only — no Dexie cruft (id/kind/createdAt)
    expect(doc.userFeatures[0]).toEqual({ name: 'PglaA', type: 'promoter', sequence: 'ACGTACGT' });
    expect(doc.userFeatures[1]).toEqual({ name: 'CBHII signal', type: 'sig_peptide', protein: 'MRSLLL' });
    expect(doc.overrides[0]).toEqual({ name: 'AmpR (lab)', type: 'CDS', sequence: 'ATGAAA', baseId: 'b1' });
  });

  it('is deterministic (no embedded timestamp unless asked)', () => {
    expect(serializeCommonFeatures(overlay)).toBe(serializeCommonFeatures(overlay));
    expect(serializeCommonFeatures(overlay, { exportedAt: '2026' })).toContain('"exportedAt": "2026"');
  });

  it('round-trips: parse(serialize(overlay)) recovers the features', () => {
    const r = parseCommonFeatures(serializeCommonFeatures(overlay));
    expect(r.ok).toBe(true);
    expect(r.userFeatures).toHaveLength(2);
    expect(r.overrides).toHaveLength(1);
    expect(r.userFeatures[0].name).toBe('PglaA');
    expect(r.overrides[0].baseId).toBe('b1');
  });

  it('empty overlay → valid JSON with empty arrays', () => {
    const doc = JSON.parse(serializeCommonFeatures({}));
    expect(doc.userFeatures).toEqual([]);
    expect(doc.overrides).toEqual([]);
  });

  it('rejects non-JSON and foreign formats', () => {
    expect(parseCommonFeatures('not json').ok).toBe(false);
    expect(parseCommonFeatures(JSON.stringify({ format: 'snapgene', userFeatures: [] })).ok).toBe(false);
  });

  it('drops invalid feature records (no name / no sequence&protein)', () => {
    const r = parseCommonFeatures(JSON.stringify({
      format: 'bodgegene-common-features',
      userFeatures: [
        { name: 'good', sequence: 'ACGT' },
        { name: '', sequence: 'ACGT' },   // no name
        { name: 'noseq' },                 // no sequence/protein
        { sequence: 'ACGT' },              // no name
      ],
    }));
    expect(r.ok).toBe(true);
    expect(r.userFeatures).toHaveLength(1);
    expect(r.userFeatures[0].name).toBe('good');
  });

  it('accepts a bare array as userFeatures', () => {
    const r = parseCommonFeatures(JSON.stringify([{ name: 'x', sequence: 'ACGT' }]));
    expect(r.ok).toBe(true);
    expect(r.userFeatures).toHaveLength(1);
  });

  it('an all-invalid file → ok:false with an error', () => {
    const r = parseCommonFeatures(JSON.stringify({ format: 'bodgegene-common-features', userFeatures: [] }));
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
